export const config = {
  TOTAL_POINTS: 51,
  FIRST_POINT_LEVEL: 10,

  // Live talent DB endpoint (defaults to same-origin).
  TALENT_API_URL:
    process.env.REACT_APP_TALENT_API_URL ?? "/talentapi.php",
};
