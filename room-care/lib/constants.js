// Shared by the server and the browser. No secrets here.
export const ROLES = {
  frontdesk:    { label: 'Front Desk',   tabs: ['rooms', 'tickets', 'log'],                         mobile: ['rooms', 'tickets'] },
  housekeeping: { label: 'Housekeeping', tabs: ['queue', 'rooms', 'inspect', 'log'],                mobile: ['queue', 'rooms', 'inspect'] },
  maintenance:  { label: 'Maintenance',  tabs: ['queue', 'rooms', 'inspect', 'log'],                mobile: ['queue', 'rooms', 'inspect'] },
  manager:      { label: 'Manager',      tabs: ['overview', 'tickets', 'rooms', 'inspect', 'log', 'staff'], mobile: ['overview', 'tickets', 'rooms', 'inspect'] }
};
export const DEPTS = { maintenance: 'Maintenance', housekeeping: 'Housekeeping' };
export const CATS = {
  maintenance: ['Plumbing', 'Electrical', 'HVAC', 'Lock / door', 'TV / tech', 'Furniture', 'Paint / walls', 'Flooring', 'Appliance', 'Safety', 'Other'],
  housekeeping: ['Deep clean', 'Linens', 'Amenities', 'Odor', 'Special request', 'Laundry', 'Other']
};
export const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
export const STATUSES = ['Open', 'In progress', 'On hold', 'Done'];

const mCat = t => /toilet|sink|shower|water|grout|drain|leak|clog|faucet|tub/i.test(t) ? 'Plumbing'
  : /hvac|thermostat|exhaust|\bac\b|a\/c|heat|too cold|too hot/i.test(t) ? 'HVAC'
  : /lock|door|latch|key|card reader/i.test(t) ? 'Lock / door'
  : /tv|phone|outlet|usb|wifi|wi-fi|remote/i.test(t) ? 'TV / tech'
  : /light|bulb|vanity|power/i.test(t) ? 'Electrical'
  : /fridge|coffee|dryer|safe/i.test(t) ? 'Appliance'
  : /smoke|evac/i.test(t) ? 'Safety'
  : /wall|paint|scuff/i.test(t) ? 'Paint / walls'
  : /carpet|floor/i.test(t) ? 'Flooring'
  : /furniture|window|blind|towel bar|chair|desk|bed frame/i.test(t) ? 'Furniture' : 'Other';
const hCat = t => /stain|spot|dirty|hair|dust|clean/i.test(t) ? 'Deep clean'
  : /towel|sheet|linen|pillow|blanket|duvet/i.test(t) ? 'Linens'
  : /coffee|soap|shampoo|amenit|restock|tissue|toilet paper|cups/i.test(t) ? 'Amenities'
  : /odor|smell|smoke/i.test(t) ? 'Odor'
  : /rollaway|crib|request|extra/i.test(t) ? 'Special request'
  : /laundry|robe/i.test(t) ? 'Laundry' : 'Other';
export const guessCat = (dept, text) => (dept === 'housekeeping' ? hCat(text || '') : mCat(text || ''));

export const SESSION_COOKIE = 'rc_session';
export const SESSION_HOURS = 12;
export const MAX_PIN_TRIES = 5;
export const LOCK_MINUTES = 15;
