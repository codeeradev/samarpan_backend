const MetaLead = require("../models/metaLead");

const SHEET_ID = "1CP5ov3LTIecWtW8SXJWA7rdDrtvlEzulniR7nXgU1fg";
const SHEET_NAME = "Samarpan_Lead_3D4K_Laparoscopic_Hisar_July"; // change if needed

const getLeadForms = async () => {
  return [
    {
      formId: "1036432268982557",
      formName: "Samarpan_Lead_3D4K_Laparoscopic_Hisar_July2026",
      status: "ACTIVE",
      leadsCount: 0,
    },
  ];
};

const syncLeads = async (adminId) => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    SHEET_NAME
  )}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Unable to fetch Google Sheet");
  }

  const csv = await response.text();

  const rows = csv
    .split("\n")
    .map((r) => r.split(",").map((c) => c.replace(/^"|"$/g, "").trim()))
    .filter((r) => r.length > 5);

  // remove header
  rows.shift();

  const operations = rows.map((row) => {
    const lead = {
      adminId,

      leadId: row[0]?.replace("l:", ""),

      createdTime: new Date(row[1]),

      formId: row[8]?.replace("f:", ""),
      formName: row[9],

      pageId: "",

      platform: "Facebook",

      fullName: row[15],

      phoneNumber: row[16]?.replace("p:", ""),

      status: row[18] || "CREATED",

      fieldData: {
        problem: row[11],
        duration: row[12],
        age: row[13],
        city: row[17],

        adGroupId: row[2]?.replace("ag:", ""),
        adGroupName: row[3],

        adSetId: row[4]?.replace("as:", ""),
        adSetName: row[5],

        campaignId: row[6]?.replace("c:", ""),
        campaignName: row[7],
      },
    };

    return {
      updateOne: {
        filter: {
          adminId,
          leadId: lead.leadId,
        },
        update: {
          $setOnInsert: lead,
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
    formsChecked: 1,
  };
};

module.exports = {
getLeadForms,
syncLeads
}