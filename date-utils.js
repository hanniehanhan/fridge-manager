'use strict';
(function (root) {
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y,m,d] = value.split('-').map(Number);
    if (y < 1) return false;
    const date = new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(0,0,0,0);
    return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d;
  }
  function todayLocal(now = new Date()) {
    return `${String(now.getFullYear()).padStart(4,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  function dayNumber(value) {
    const [y,m,d] = value.split('-').map(Number);
    const date = new Date(0); date.setUTCFullYear(y,m-1,d); date.setUTCHours(0,0,0,0);
    return date.getTime()/86400000;
  }
  function status(expiry, today = todayLocal()) {
    const days = dayNumber(expiry)-dayNumber(today);
    return days < 0 ? 'expired' : days === 0 ? 'today' : days <= 3 ? 'soon' : 'fresh';
  }
  root.FridgeDates = {validDate,todayLocal,status};
})(globalThis);
