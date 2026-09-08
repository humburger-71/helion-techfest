"use strict";

module.exports = function sheetDetails(interest) {
  return [
    interest.interestId ?? interest.interest_id,
    interest.submittedAt ?? interest.submitted_at,
    interest.members[0]?.name || "",
    interest.members[0]?.email || "",
    interest.mobile || "",
    interest.grade || "",
    interest.age ?? ""
  ];
};
