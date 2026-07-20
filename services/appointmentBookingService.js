const crypto = require("crypto");
const axios = require("axios");
const mongoose = require("mongoose");
const Appointment = require("../models/appointment");
const AppointmentSlot = require("../models/appointmentSlot");
const Setting = require("../models/setting");
const User = require("../models/user");
const ROLES = require("../constants/roles");

const BOOKED_STATUSES = ["pending", "confirmed", "rescheduled"];
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIMEZONE_OFFSET = process.env.APPOINTMENT_TIMEZONE_OFFSET || "+05:30";

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const getOffsetMinutes = () => {
  const match = TIMEZONE_OFFSET.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
};

const getLocalDateKeyFromDate = (date) =>
  new Date(date.getTime() + getOffsetMinutes() * 60000)
    .toISOString()
    .slice(0, 10);

const normalizeDateKey = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getLocalDateKeyFromDate(value);
  }
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const localDateTimeMatch = text.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/);
  if (localDateTimeMatch && !/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    return localDateTimeMatch[1];
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : getLocalDateKeyFromDate(parsed);
};

const buildLocalDate = (dateKey, time = "00:00") =>
  new Date(`${dateKey}T${time}:00${TIMEZONE_OFFSET}`);

const startOfLocalDay = (dateKey) => buildLocalDate(dateKey);

const getWeekdayFromDateKey = (dateKey) => buildLocalDate(dateKey).getDay();

const addDaysToDateKey = (dateKey, days) => {
  const date = buildLocalDate(dateKey);
  date.setDate(date.getDate() + days);
  return getLocalDateKeyFromDate(date);
};

const endOfLocalDay = (dateKey) => {
  const end = buildLocalDate(dateKey, "23:59");
  end.setSeconds(59, 999);
  return end;
};

const getTodayKey = () => {
  const now = new Date();
  return getLocalDateKeyFromDate(now);
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const isValidTimeRange = (startTime, endTime) =>
  TIME_PATTERN.test(startTime) &&
  TIME_PATTERN.test(endTime) &&
  startTime < endTime;

const timeToMinutes = (time) => {
  const [hours, minutes] = normalizeText(time).split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (value) => {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const getPayloadTimeSlots = (payload) => {
  const rawTimeSlots = Array.isArray(payload.timeSlots)
    ? payload.timeSlots
    : Array.isArray(payload.time_slots)
      ? payload.time_slots
      : [];
  const source = rawTimeSlots.length
    ? rawTimeSlots
    : [
        {
          startTime: payload.startTime || payload.start_time,
          endTime: payload.endTime || payload.end_time,
          maximumPatients:
            payload.maximumPatients ?? payload.maximum_patients,
          isActive: payload.isActive,
        },
      ];

  const timeSlots = source.map((slot) => {
    const startTime = normalizeText(slot.startTime || slot.start_time);
    const endTime = normalizeText(slot.endTime || slot.end_time);
    if (!isValidTimeRange(startTime, endTime)) {
      throw new Error("Start time and end time must be valid HH:mm values");
    }

    const maximumPatients = Number(
      slot.maximumPatients ?? slot.maximum_patients,
    );
    if (!Number.isInteger(maximumPatients) || maximumPatients < 1) {
      throw new Error("Maximum patients must be at least 1");
    }

    const isActive = slot.isActive !== undefined 
      ? slot.isActive === true || slot.isActive === 'true'
      : true;

    return { startTime, endTime, maximumPatients, isActive };
  });

  return timeSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
};

const getPayloadWeeklyDays = (payload) => {
  const rawWeeklyDays = Array.isArray(payload.weeklyDays)
    ? payload.weeklyDays
    : Array.isArray(payload.weekly_days)
      ? payload.weekly_days
      : [];

  return rawWeeklyDays
    .map((day) => {
      const dateKey = normalizeDateKey(day.date);
      if (!dateKey) {
        throw new Error("Date is required for every week day");
      }

      const weekday =
        day.weekday !== undefined && day.weekday !== null
          ? Number(day.weekday)
          : getWeekdayFromDateKey(dateKey);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error("Weekly slot day must be a valid day of the week");
      }

      const isActive = day.isActive !== undefined 
        ? day.isActive === true || day.isActive === 'true'
        : true;

      return {
        date: startOfLocalDay(dateKey),
        dateKey,
        weekday,
        isActive,
        timeSlots: getPayloadTimeSlots(day),
      };
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
};

const getRazorpayCredentials = async () => {
  const settings = await Setting.findOne().lean();
  return {
    keyId:
      normalizeText(settings?.razorpay_key_id) ||
      normalizeText(process.env.RAZORPAY_KEY_ID),
    keySecret:
      normalizeText(settings?.razorpay_key_secret) ||
      normalizeText(process.env.RAZORPAY_KEY_SECRET),
  };
};

const isRazorpayConfigured = async () => {
  const credentials = await getRazorpayCredentials();
  return Boolean(credentials.keyId && credentials.keySecret);
};

const findDoctor = async (doctorId) => {
  if (!isValidObjectId(doctorId)) {
    return null;
  }

  return User.findOne({
    _id: doctorId,
    roleId: ROLES.DOCTOR,
    status: { $ne: false },
    isActive: { $ne: false },
  }).select("_id name");
};

const buildSlotPayload = async (payload, userId) => {
  const doctor = await findDoctor(payload.doctorId || payload.doctor_id);
  if (!doctor) {
    throw new Error("Selected doctor not found");
  }

  const requestedSlotType = normalizeText(payload.slotType || payload.slot_type)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  const slotType =
    requestedSlotType === "daywise" || requestedSlotType === "daily"
      ? "daily"
      : requestedSlotType === "week" || requestedSlotType === "weekly"
        ? "weekly"
        : requestedSlotType;
  if (!["daily", "weekly"].includes(slotType)) {
    throw new Error("Slot type must be day wise or week");
  }

  const weeklyDays =
    slotType === "weekly" ? getPayloadWeeklyDays(payload) : [];
  const timeSlots = weeklyDays.length
    ? weeklyDays[0].timeSlots
    : getPayloadTimeSlots(payload);
  const allTimeSlots = weeklyDays.length
    ? weeklyDays.flatMap((day) => day.timeSlots)
    : timeSlots;
  const sortedTimeSlots = [...allTimeSlots].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
  const firstTimeSlot = sortedTimeSlots[0];
  const lastTimeSlot = sortedTimeSlots[sortedTimeSlots.length - 1];
  const startTime = firstTimeSlot.startTime;
  const endTime = lastTimeSlot.endTime;
  const maximumPatients = allTimeSlots.reduce(
    (total, slot) => total + Number(slot.maximumPatients || 0),
    0,
  );

  const appointmentPrice = Number(
    payload.appointmentPrice ?? payload.appointment_price ?? 0,
  );
  if (Number.isNaN(appointmentPrice) || appointmentPrice < 0) {
    throw new Error("Appointment price must be 0 or more");
  }

  const slotDurationMinutes = Number(
    payload.slotDurationMinutes ??
      payload.slot_duration_minutes ??
      30,
  );
  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 1) {
    throw new Error("Slot duration must be at least 1 minute");
  }
  if (slotDurationMinutes > timeToMinutes(endTime) - timeToMinutes(startTime)) {
    throw new Error("Slot duration cannot be longer than the slot time range");
  }

  const bookingCloseMinutesBeforeEnd = Number(
    payload.bookingCloseMinutesBeforeEnd ??
      payload.booking_close_minutes_before_end ??
      10,
  );
  if (
    !Number.isInteger(bookingCloseMinutesBeforeEnd) ||
    bookingCloseMinutesBeforeEnd < 0
  ) {
    throw new Error("Booking close time must be 0 minutes or more");
  }
  if (
    allTimeSlots.some(
      (slot) =>
        bookingCloseMinutesBeforeEnd >
        timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime),
    )
  ) {
    throw new Error("Booking close time cannot be longer than a slot time range");
  }

  const slot = {
    doctorId: doctor._id,
    doctorName: doctor.name,
    slotType,
    startTime,
    endTime,
    maximumPatients,
    timeSlots,
    weeklyDays,
    appointmentPrice,
    slotDurationMinutes,
    bookingCloseMinutesBeforeEnd,
    isActive:
      payload.isActive !== undefined
        ? payload.isActive === true || payload.isActive === "true"
        : payload.status
          ? normalizeText(payload.status).toLowerCase() === "active"
          : true,
    updatedBy: userId || null,
  };

  if (slotType === "daily") {
    const dateKey = normalizeDateKey(payload.date);
    if (!dateKey) {
      throw new Error("Date is required for day wise slots");
    }
    slot.date = startOfLocalDay(dateKey);
    slot.weekday = null;
  } else {
    const dateKey = weeklyDays[0]?.dateKey || normalizeDateKey(payload.date);
    if (!dateKey) {
      throw new Error("Date is required for week slots");
    }
    const weekday =
      weeklyDays[0]?.weekday ??
      (payload.weekday !== undefined && payload.weekday !== null
        ? Number(payload.weekday)
        : getWeekdayFromDateKey(dateKey));
    if (
      weekday !== null &&
      (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)
    ) {
      throw new Error("Weekly slot day must be a valid day of the week");
    }
    slot.date = startOfLocalDay(dateKey);
    slot.weekday = weekday;
  }

  return slot;
};

const createAppointmentSlot = async (payload, userId) => {
  const slotPayload = await buildSlotPayload(payload, userId);
  return AppointmentSlot.create({ ...slotPayload, createdBy: userId || null });
};

const updateAppointmentSlot = async (id, payload, userId) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  // Support partial update for status toggle
  if (Object.keys(payload).length === 1 && 'isActive' in payload) {
    return AppointmentSlot.findByIdAndUpdate(
      id,
      { 
        isActive: payload.isActive === true || payload.isActive === 'true',
        updatedBy: userId || null 
      },
      {
        new: true,
        runValidators: true,
      }
    );
  }

  // Full update with validation
  const slotPayload = await buildSlotPayload(payload, userId);
  return AppointmentSlot.findByIdAndUpdate(id, slotPayload, {
    new: true,
    runValidators: true,
  });
};

const deleteAppointmentSlot = async (id) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  return AppointmentSlot.findByIdAndDelete(id);
};

const getAppointmentSlots = async (query = {}) => {
  const filter = {};

  if (query.doctorId && isValidObjectId(query.doctorId)) {
    filter.doctorId = query.doctorId;
  }

  const slotType = normalizeText(query.slotType).toLowerCase();
  if (["daily", "weekly"].includes(slotType)) {
    filter.slotType = slotType;
  }

  if (query.status === "active") filter.isActive = true;
  if (query.status === "inactive") filter.isActive = false;

  const selectedDateKey = normalizeDateKey(query.date);
  if (selectedDateKey) {
    const selectedWeekday = getWeekdayFromDateKey(selectedDateKey);
    const legacyWeekStartKey = addDaysToDateKey(selectedDateKey, -6);
    filter.$or = [
      {
        slotType: "daily",
        date: {
          $gte: startOfLocalDay(selectedDateKey),
          $lte: endOfLocalDay(selectedDateKey),
        },
      },
      {
        slotType: "weekly",
        $or: [
          {
            date: {
              $gte: startOfLocalDay(selectedDateKey),
              $lte: endOfLocalDay(selectedDateKey),
            },
          },
          {
            "weeklyDays.date": {
              $gte: startOfLocalDay(selectedDateKey),
              $lte: endOfLocalDay(selectedDateKey),
            },
          },
          {
            date: null,
            createdAt: {
              $gte: startOfLocalDay(legacyWeekStartKey),
              $lte: endOfLocalDay(selectedDateKey),
            },
            $or: [{ weekday: null }, { weekday: selectedWeekday }],
          },
        ],
      },
    ];
  }

  const slots = await AppointmentSlot.find(filter)
    .sort({ slotType: 1, date: 1, weekday: 1, startTime: 1 })
    .lean();

  return decorateSlots(slots, query.date);
};

const getMatchingSlots = async (doctorId, dateKey) => {
  if (!isValidObjectId(doctorId) || !dateKey) {
    return [];
  }

  const selectedWeekday = getWeekdayFromDateKey(dateKey);
  const legacyWeekStartKey = addDaysToDateKey(dateKey, -6);

  return AppointmentSlot.find({
    doctorId,
    $or: [
      {
        slotType: "daily",
        date: { $gte: startOfLocalDay(dateKey), $lte: endOfLocalDay(dateKey) },
      },
      {
        slotType: "weekly",
        $or: [
          {
            date: { $gte: startOfLocalDay(dateKey), $lte: endOfLocalDay(dateKey) },
          },
          {
            "weeklyDays.date": {
              $gte: startOfLocalDay(dateKey),
              $lte: endOfLocalDay(dateKey),
            },
          },
          {
            date: null,
            createdAt: {
              $gte: startOfLocalDay(legacyWeekStartKey),
              $lte: endOfLocalDay(dateKey),
            },
            $or: [{ weekday: null }, { weekday: selectedWeekday }],
          },
        ],
      },
    ],
  })
    .sort({ startTime: 1 })
    .lean();
};

const countSlotBookings = async (slots, dateKey) => {
  if (!slots.length) return {};
  const parentSlotIds = [
    ...new Set(slots.map((slot) => String(slot.parentSlotId || slot._id))),
  ].filter(isValidObjectId);

  const rows = await Appointment.aggregate([
    {
      $match: {
        slotId: {
          $in: parentSlotIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        appointmentDate: {
          $gte: startOfLocalDay(dateKey),
          $lte: endOfLocalDay(dateKey),
        },
        status: { $in: BOOKED_STATUSES },
      },
    },
    {
      $group: {
        _id: { slotId: "$slotId", slotLabel: "$slotLabel" },
        count: { $sum: 1 },
      },
    },
  ]);

  return rows.reduce((acc, row) => {
    const slotId = String(row._id.slotId);
    const slotLabel = row._id.slotLabel || "";
    acc[slotId] = (acc[slotId] || 0) + row.count;
    acc[`${slotId}|${slotLabel}`] = row.count;
    return acc;
  }, {});
};

const getSlotState = (slot, dateKey, bookedCount = 0) => {
  const todayKey = getTodayKey();
  const legacyWeeklyStartKey =
    slot.slotType === "weekly" && !slot.date && slot.createdAt
      ? normalizeDateKey(slot.createdAt)
      : "";
  const legacyWeeklyEndKey = legacyWeeklyStartKey
    ? addDaysToDateKey(legacyWeeklyStartKey, 6)
    : "";
  const slotDateKey =
    slot.slotType === "daily" || slot.date
      ? normalizeDateKey(slot.date)
      : dateKey;
  const bookingCloseMinutesBeforeEnd = Number(
    slot.bookingCloseMinutesBeforeEnd ?? 10,
  );
  const closeTime = minutesToTime(
    Math.max(timeToMinutes(slot.endTime) - bookingCloseMinutesBeforeEnd, 0),
  );
  const bookingCloseAt = buildLocalDate(slotDateKey || dateKey, closeTime);
  const now = new Date();
  const isExpired =
    dateKey < todayKey ||
    (["daily", "weekly"].includes(slot.slotType) &&
      slotDateKey &&
      slotDateKey < todayKey) ||
    (legacyWeeklyEndKey && dateKey > legacyWeeklyEndKey);
  const bookingClosed = now >= bookingCloseAt;
  const slotCapacity = getSlotCapacity(slot);
  const isFull = bookedCount >= slotCapacity;
  const inactive = slot.isActive === false;

  let disabledReason = "";
  if (inactive) disabledReason = "Inactive";
  else if (isExpired) disabledReason = "Expired";
  else if (bookingClosed) disabledReason = "Booking closed";
  else if (isFull) disabledReason = "Full";

  return {
    bookedCount,
    remainingPatients: Math.max(slotCapacity - bookedCount, 0),
    isFull,
    isExpired,
    startTimePassed: bookingClosed,
    bookingClosed,
    bookingCloseAt,
    bookingCloseTime: closeTime,
    bookingCloseMinutesBeforeEnd,
    isAvailable: !disabledReason,
    disabledReason,
  };
};

const getStoredTimeSlots = (slot) =>
  Array.isArray(slot.timeSlots) && slot.timeSlots.length
    ? slot.timeSlots
        .map((timeSlot) => ({
          startTime: normalizeText(timeSlot.startTime),
          endTime: normalizeText(timeSlot.endTime),
          maximumPatients: Number(timeSlot.maximumPatients || 0),
          isActive: timeSlot.isActive !== undefined ? timeSlot.isActive : true,
        }))
        .filter(
          (timeSlot) =>
            isValidTimeRange(timeSlot.startTime, timeSlot.endTime) &&
            timeSlot.maximumPatients > 0,
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
    : [];

const getStoredWeeklyDays = (slot) =>
  Array.isArray(slot.weeklyDays) && slot.weeklyDays.length
    ? slot.weeklyDays
        .map((day) => {
          const dateKey = normalizeDateKey(day.date);
          return {
            date: day.date,
            dateKey,
            weekday:
              day.weekday !== undefined && day.weekday !== null
                ? Number(day.weekday)
                : dateKey
                  ? getWeekdayFromDateKey(dateKey)
                  : null,
            isActive: day.isActive !== undefined ? day.isActive : true,
            timeSlots: getStoredTimeSlots(day),
          };
        })
        .filter(
          (day) =>
            day.dateKey &&
            Number.isInteger(day.weekday) &&
            day.weekday >= 0 &&
            day.weekday <= 6 &&
            day.timeSlots.length,
        )
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    : [];

const getSlotCapacity = (slot) => {
  if (slot.parentSlotId) {
    return Number(slot.maximumPatients || 0);
  }

  const storedWeeklyDays = getStoredWeeklyDays(slot);
  if (storedWeeklyDays.length) {
    return storedWeeklyDays.reduce(
      (total, day) =>
        total +
        day.timeSlots.reduce(
          (dayTotal, timeSlot) =>
            dayTotal + Number(timeSlot.maximumPatients || 0),
          0,
        ),
      0,
    );
  }

  const storedTimeSlots = getStoredTimeSlots(slot);
  if (storedTimeSlots.length) {
    return storedTimeSlots.reduce(
      (total, timeSlot) => total + Number(timeSlot.maximumPatients || 0),
      0,
    );
  }

  return Number(slot.maximumPatients || 0);
};

const expandSlotByDuration = (slot, selectedDateKey = "") => {
  const storedWeeklyDays = getStoredWeeklyDays(slot);
  if (storedWeeklyDays.length) {
    const parentSlotId = slot.parentSlotId || slot._id;
    const matchingDays = selectedDateKey
      ? storedWeeklyDays.filter((day) => day.dateKey === selectedDateKey)
      : storedWeeklyDays;

    return matchingDays
      .filter((day) => day.isActive !== false) // Filter inactive days
      .flatMap((day) =>
        day.timeSlots
          .filter((timeSlot) => timeSlot.isActive !== false) // Filter inactive time slots
          .map((timeSlot) => ({
            ...slot,
            _id: `${String(parentSlotId)}__${day.dateKey}__${timeSlot.startTime}`,
            parentSlotId,
            date: day.date,
            dateKey: day.dateKey,
            weekday: day.weekday,
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
            maximumPatients: timeSlot.maximumPatients,
            slotLabel: `${timeSlot.startTime} - ${timeSlot.endTime}`,
          })),
      );
  }

  const storedTimeSlots = getStoredTimeSlots(slot);
  if (storedTimeSlots.length) {
    const parentSlotId = slot.parentSlotId || slot._id;
    return storedTimeSlots
      .filter((timeSlot) => timeSlot.isActive !== false) // Filter inactive time slots
      .map((timeSlot) => ({
        ...slot,
        _id: `${String(parentSlotId)}__${timeSlot.startTime}`,
        parentSlotId,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        maximumPatients: timeSlot.maximumPatients,
        slotLabel: `${timeSlot.startTime} - ${timeSlot.endTime}`,
      }));
  }

  const duration = Number(slot.slotDurationMinutes || 30);
  const startMinutes = timeToMinutes(slot.startTime);
  const endMinutes = timeToMinutes(slot.endTime);
  const lastStartMinutes = endMinutes - duration;
  const expanded = [];

  for (
    let appointmentStart = startMinutes;
    appointmentStart <= lastStartMinutes;
    appointmentStart += duration
  ) {
    const appointmentEnd = appointmentStart + duration;
    const startTime = minutesToTime(appointmentStart);
    const endTime = minutesToTime(appointmentEnd);
    const parentSlotId = slot.parentSlotId || slot._id;

    expanded.push({
      ...slot,
      _id: `${String(parentSlotId)}__${startTime}`,
      parentSlotId,
      startTime,
      endTime,
      slotLabel: `${startTime} - ${endTime}`,
    });
  }

  return expanded;
};

const decorateSlots = async (slots, selectedDate, options = {}) => {
  const selectedDateKey = normalizeDateKey(selectedDate);
  const fallbackDateKey = selectedDateKey || getTodayKey();
  const outputSlots = options.expandByDuration
    ? slots.flatMap((slot) => expandSlotByDuration(slot, selectedDateKey))
    : slots;
  const dateKeys = [
    ...new Set(
      outputSlots.map((slot) =>
        selectedDateKey ||
        (slot.slotType === "daily" || slot.date
          ? normalizeDateKey(slot.date)
          : fallbackDateKey),
      ),
    ),
  ];
  const bookingCountEntries = await Promise.all(
    dateKeys.map(async (dateKey) => [
      dateKey,
      await countSlotBookings(slots, dateKey),
    ]),
  );
  const bookingCountsByDate = Object.fromEntries(bookingCountEntries);

  return outputSlots.map((slot) => {
    const dateKey =
      selectedDateKey ||
      (slot.slotType === "daily" || slot.date
        ? normalizeDateKey(slot.date)
        : fallbackDateKey);
    const bookingCounts = bookingCountsByDate[dateKey] || {};
    const slotDateKey =
      slot.slotType === "daily" || slot.date ? normalizeDateKey(slot.date) : null;
    const parentSlotId = slot.parentSlotId || slot._id;
    const slotLabel = slot.slotLabel || `${slot.startTime} - ${slot.endTime}`;
    const countKey = options.expandByDuration
      ? `${String(parentSlotId)}|${slotLabel}`
      : String(parentSlotId);

    return {
      ...slot,
      date: slotDateKey,
      dateKey: slotDateKey,
      appliesOnDateKey: dateKey,
      parentSlotId,
      slotLabel,
      weeklyDays: getStoredWeeklyDays(slot),
      ...getSlotState(slot, dateKey, bookingCounts[countKey] || 0),
    };
  });
};

const keepLatestPassedSlot = (slots, dateKey) => {
  if (dateKey !== getTodayKey()) {
    return slots;
  }

  const latestPassedSlot = slots
    .filter((slot) => slot.startTimePassed)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))[0];

  if (!latestPassedSlot) {
    return slots;
  }

  return slots.filter(
    (slot) =>
      !slot.startTimePassed || String(slot._id) === String(latestPassedSlot._id),
  );
};

const getAvailableSlotsForBooking = async ({ doctorId, date }) => {
  const dateKey = normalizeDateKey(date);
  if (!dateKey) {
    throw new Error("Appointment date is required");
  }

  if (dateKey < getTodayKey()) {
    throw new Error("Appointment date cannot be in the past");
  }

  const slots = await getMatchingSlots(doctorId, dateKey);
  const decoratedSlots = await decorateSlots(slots, dateKey, {
    expandByDuration: true,
  });
  return keepLatestPassedSlot(decoratedSlots, dateKey);
};

const ensureSlotCanBook = async ({ doctorId, date, slotId }) => {
  const normalizedSlotId = normalizeText(slotId);
  const parentSlotId = normalizedSlotId.split("__")[0];
  const isGeneratedSlotId = normalizedSlotId.includes("__");

  if (!isValidObjectId(parentSlotId)) {
    throw new Error("A valid appointment slot is required");
  }

  const slots = await getAvailableSlotsForBooking({ doctorId, date });
  const slot = slots.find((item) => {
    if (isGeneratedSlotId) {
      return String(item._id) === normalizedSlotId;
    }

    return String(item.parentSlotId) === parentSlotId;
  });

  if (!slot) {
    throw new Error("Selected slot is not available for this doctor and date");
  }

  if (!slot.isAvailable) {
    throw new Error(`Selected slot is not available: ${slot.disabledReason}`);
  }

  return {
    ...slot,
    _id: slot.parentSlotId || slot._id,
  };
};

const getRazorpayAmount = (amount) => {
  const rupees = Number(amount || 0);
  if (!rupees || rupees < 1) {
    throw new Error("Slot appointment price is required for Razorpay payment");
  }
  return Math.round(rupees * 100);
};

const createRazorpayOrder = async ({ receipt, amount }) => {
  const { keyId, keySecret } = await getRazorpayCredentials();

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  const razorpayAmount = getRazorpayAmount(amount);
  const response = await axios.post(
    "https://api.razorpay.com/v1/orders",
    {
      amount: razorpayAmount,
      currency: "INR",
      receipt,
      payment_capture: 1,
    },
    {
      auth: {
        username: keyId,
        password: keySecret,
      },
    },
  );

  return {
    order: response.data,
    amount: razorpayAmount,
    currency: "INR",
    keyId,
  };
};

const verifyRazorpaySignature = async ({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) => {
  const { keySecret } = await getRazorpayCredentials();
  if (!keySecret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return expected === razorpaySignature;
};

module.exports = {
  buildLocalDate,
  createAppointmentSlot,
  createRazorpayOrder,
  deleteAppointmentSlot,
  ensureSlotCanBook,
  getAppointmentSlots,
  getAvailableSlotsForBooking,
  isRazorpayConfigured,
  normalizeDateKey,
  updateAppointmentSlot,
  verifyRazorpaySignature,
};
