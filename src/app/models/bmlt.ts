import { RawMeeting } from './meeting';

/**
 * BMLT (Basic Meeting List Toolbox) support.
 *
 * A BMLT root server's `GetSearchResults` endpoint returns a flat array of meetings
 * (or `{ meetings, formats }` when `get_used_formats=1` is passed). This file converts
 * those records into the Meeting Guide shape the rest of the app already understands,
 * so filtering, the detail page and calendar export all work unchanged.
 */
export interface BmltMeeting {
  id_bigint: string;
  meeting_name: string;
  weekday_tinyint: string; // 1 = Sunday … 7 = Saturday
  start_time: string; // "19:00:00"
  duration_time?: string; // "01:30:00"
  time_zone?: string;
  venue_type?: string; // 1 = in person, 2 = virtual, 3 = hybrid
  formats?: string; // "O,D,WC"
  lang_enum?: string;
  latitude?: string;
  longitude?: string;
  service_body_name?: string;
  location_text?: string;
  location_info?: string;
  location_street?: string;
  location_neighborhood?: string;
  location_municipality?: string;
  location_sub_province?: string;
  location_province?: string;
  location_postal_code_1?: string;
  location_cross_street?: string;
  comments?: string;
  phone_meeting_number?: string;
  virtual_meeting_link?: string;
  virtual_meeting_additional_info?: string;
  published?: string;
  [key: string]: unknown;
}

export interface BmltFormat {
  id?: string;
  key_string: string;
  name_string: string;
  description_string?: string;
  world_id?: string;
}

/** Fallback labels for standard NA format codes, used when the server doesn't send its own. */
export const NA_FORMATS: Record<string, string> = {
  AB: 'Ask-It-Basket',
  Ag: 'Agnostic',
  B: 'Beginners',
  BK: 'Book Study',
  BL: 'Bilingual',
  BT: 'Basic Text',
  C: 'Closed',
  CH: 'Closed Holidays',
  CL: 'Candlelight',
  CPT: '12 Concepts',
  CS: 'Children under Supervision',
  CW: 'Children Welcome',
  D: 'Discussion/Participation',
  ES: 'Español',
  FD: 'Five and Dime',
  GL: 'Gay/Lesbian/Transgender',
  GP: 'Guiding Principles',
  HY: 'Hybrid',
  IL: 'Illness',
  IP: 'Informational Pamphlet',
  IW: 'It Works – How and Why',
  JT: 'Just for Today',
  LC: 'Living Clean',
  LGBTQ: 'LGBTQ+',
  M: 'Men',
  ME: 'Meditation',
  NC: 'No Children',
  NS: 'No Smoking',
  O: 'Open',
  OE: 'Open-ended',
  OUT: 'Outdoor',
  Pi: 'Pitch',
  QA: 'Questions & Answers',
  RA: 'Restricted Attendance',
  RF: 'Rotating Format',
  Rr: 'Round Robin',
  SC: 'Surveillance Cameras',
  SD: 'Speaker/Discussion',
  SG: 'Step Working Guide',
  SL: 'American Sign Language',
  Sm: 'Smoking Permitted',
  SP: 'Speaker',
  SPAD: 'A Spiritual Principle a Day',
  St: 'Step',
  TC: 'Temporarily Closed',
  Ti: 'Timer',
  To: 'Topic',
  Tr: 'Tradition',
  TW: 'Traditions Workshop',
  VM: 'Virtual',
  W: 'Women',
  WC: 'Wheelchair Accessible',
  YP: 'Young People',
};

/** Format codes that describe attendance rather than meeting content. */
export const BMLT_ATTENDANCE_CODES = ['VM', 'HY', 'TC'];

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** BMLT stores some cross streets as "Cross Street#@-@#Cove Road". */
const stripFieldPrefix = (v: unknown): string => s(v).replace(/^.*#@-@#/, '').trim();

function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** "19:00:00" + "01:30:00" → "20:30" */
function endTime(start: string, duration: string): string | null {
  const a = start.match(/^(\d{1,2}):(\d{2})/);
  const d = duration.match(/^(\d{1,2}):(\d{2})/);
  if (!a || !d) return null;
  const total = (+a[1] * 60 + +a[2] + +d[1] * 60 + +d[2]) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Only keep links that actually point at a meeting (drops bare "http://zoom.us"). */
function meetingLink(v: unknown): string | null {
  const raw = s(v);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if ((u.pathname === '/' || u.pathname === '') && !u.search) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Phone field is free text; use it as a dial string only if it looks like one. */
function phoneParts(v: unknown): { phone: string | null; notes: string | null } {
  const raw = s(v);
  if (!raw) return { phone: null, notes: null };
  const dialable = raw.replace(/^tel:/i, '');
  if (/^\+?[\d\s().-]{7,}[\d,#*]*$/.test(dialable)) return { phone: dialable, notes: null };
  return { phone: null, notes: raw };
}

function uniqueText(parts: string[]): string | null {
  const seen = new Set<string>();
  const out = parts.filter((p) => {
    const k = p.toLowerCase();
    if (!p || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out.length ? out.join('\n') : null;
}

export function bmltToRaw(b: BmltMeeting): RawMeeting | null {
  const id = s(b.id_bigint);
  const name = s(b.meeting_name);
  if (!id || !name || s(b.published) === '0') return null;

  const weekday = parseInt(s(b.weekday_tinyint), 10);
  const types = s(b.formats)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (s(b.lang_enum) === 'es' && !types.includes('ES')) types.push('ES');

  const venue = s(b.venue_type);
  const street = s(b.location_street);
  const link = meetingLink(b.virtual_meeting_link);
  const { phone, notes: phoneNotes } = phoneParts(b.phone_meeting_number);
  const virtualInfo = s(b.virtual_meeting_additional_info);
  const closed = types.includes('TC');

  // Physical address only for venues that have one (virtual meetings carry a city for
  // time-zone purposes, which must not make them look in-person).
  const physical = venue !== '2' && !!street && !/^(zoom|online|virtual)$/i.test(street);
  const city = s(b.location_municipality);
  const stateZip = [s(b.location_province), s(b.location_postal_code_1)].filter(Boolean).join(' ');
  const formattedAddress = physical ? [street, city, stateZip].filter(Boolean).join(', ') : null;

  let attendance: RawMeeting['attendance_option'];
  const online = !!(link || phone || venue === '2' || venue === '3');
  if (physical && !closed && online && venue !== '1') attendance = 'hybrid';
  else if (online && venue !== '1') attendance = 'online';
  else if (physical && !closed) attendance = 'in_person';
  else attendance = 'inactive';

  const cross = stripFieldPrefix(b.location_cross_street);

  return {
    slug: `${slugify(name) || 'meeting'}-${id}`,
    name,
    day: Number.isInteger(weekday) && weekday >= 1 && weekday <= 7 ? weekday - 1 : null,
    time: s(b.start_time) || null,
    end_time: endTime(s(b.start_time), s(b.duration_time) || '01:00:00'),
    types,
    notes: s(b.comments) || null,
    location: s(b.location_text) || null,
    location_notes: physical
      ? uniqueText([s(b.location_info), cross ? `Cross street: ${cross}` : ''])
      : null,
    formatted_address: formattedAddress,
    region: city || s(b.location_sub_province) || null,
    service_body: s(b.service_body_name) || null,
    conference_url: link,
    conference_url_notes: link ? virtualInfo || null : null,
    conference_phone: phone,
    conference_phone_notes: uniqueText([phoneNotes ?? '', !link ? virtualInfo : '']),
    latitude: s(b.latitude) || null,
    longitude: s(b.longitude) || null,
    timezone: s(b.time_zone) || null,
    attendance_option: attendance,
  };
}

/** Accepts either a bare array or `{ meetings, formats }` (get_used_formats=1). */
export function parseBmltResponse(body: unknown): { meetings: RawMeeting[]; labels: Record<string, string> } | null {
  let list: unknown;
  let formats: BmltFormat[] = [];
  if (Array.isArray(body)) list = body;
  else if (body && typeof body === 'object' && Array.isArray((body as { meetings?: unknown }).meetings)) {
    list = (body as { meetings: unknown[] }).meetings;
    const f = (body as { formats?: unknown }).formats;
    if (Array.isArray(f)) formats = f as BmltFormat[];
  } else return null;

  const labels: Record<string, string> = {};
  for (const f of formats) {
    if (f?.key_string && f?.name_string) labels[s(f.key_string)] = s(f.name_string);
  }

  const meetings = (list as BmltMeeting[])
    .map((m) => (m && typeof m === 'object' ? bmltToRaw(m) : null))
    .filter((m): m is RawMeeting => m !== null);
  return { meetings, labels };
}
