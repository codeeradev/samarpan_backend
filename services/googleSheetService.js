const MetaLead = require("../models/metaLead");

const SHEETS = [
  {
    id: "1CP5ov3LTIecWtW8SXJWA7rdDrtvlEzulniR7nXgU1fg",
    name: "Samarpan_Lead_3D4K_Laparoscopic_Hisar_July",
  },
  {
    id: "1fuJ-m5G_STZemiGd8RGN2OsB6k-Wf5j4TIPvpHQvM60",
    name: "Dr Vishal | Laser Hair Reduction | Leads",
  },
];

const getLeadForms = async () => {
  return [
    {
      formId: "1036432268982557",
      formName: "Samarpan_Lead_3D4K_Laparoscopic_Hisar_July2026",
      status: "ACTIVE",
      leadsCount: 0,
    },
    {
      formId: "1349761563292989",
      formName: "Dr Vishal | Laser Hair Reduction | Leads",
      status: "ACTIVE",
      leadsCount: 0,
    },
  ];
};

const syncLeads = async (adminId) => {
  let allRows = [];

  for (const sheet of SHEETS) {
    const url = `https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet.name)}`;

    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Unable to fetch sheet: ${sheet.name}`);
      continue;
    }

    const csv = await response.text();

    const rows = csv
      .split("\n")
      .map((r) => r.split(",").map((c) => c.replace(/^"|"$/g, "").trim()))
      .filter((r) => r.length > 5);

    rows.shift();

    rows.forEach((row) => allRows.push({ row, sheet: sheet.name }));
  }

  const operations = allRows.map(({ row, sheet }) => {
    let fullName, phoneNumber, city, status, problem, duration, age;

    if (sheet === "Dr Vishal | Laser Hair Reduction | Leads") {
      fullName = row[13];
      phoneNumber = row[14]?.replace("p:", "");
      city = row[15];
      status = row[16] || "CREATED";

      problem = row[12]; // face
      duration = "";
      age = "";
    } else {
      fullName = row[15];
      phoneNumber = row[16]?.replace("p:", "");
      city = row[17];
      status = row[18] || "CREATED";

      problem = row[11];
      duration = row[12];
      age = row[13];
    }

    return {
      updateOne: {
        filter: {
          adminId,
          leadId: row[0]?.replace("l:", ""),
        },
        update: {
          $setOnInsert: {
            adminId,
            leadId: row[0]?.replace("l:", ""),
            createdTime: new Date(row[1]),

            formId: row[8]?.replace("f:", ""),
            formName: row[9],

            pageId: "",
            platform: "Facebook",

            fullName,
            phoneNumber,
            status,

            fieldData: {
              problem,
              duration,
              age,
              city,

              adGroupId: row[2]?.replace("ag:", ""),
              adGroupName: row[3],

              adSetId: row[4]?.replace("as:", ""),
              adSetName: row[5],

              campaignId: row[6]?.replace("c:", ""),
              campaignName: row[7],
            },
          },
        },
        upsert: true,
      },
    };
  });

  let syncedCount = 0;

  if (operations.length) {
    const result = await MetaLead.bulkWrite(operations, {
      ordered: false,
    });

    syncedCount = result.upsertedCount || 0;
  }

  return {
    syncedCount,
    formsChecked: SHEETS.length,
  };
};

module.exports = {
  getLeadForms,
  syncLeads,
};
