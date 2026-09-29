// functions/src/campus.ts
// UWI Mona places for proximity pricing: where students can have food
// delivered (halls, faculties, other places) and where food is picked up
// (the food spots stores are linked to). Shared by the app (checkout picker,
// fee shown before ordering) and the server (verifyNewOrder prices every
// order from these; the app's number is never trusted).
//
// Positions come from OpenStreetMap (building or block centres), checked
// against the UWI Mona site. `source` says how sure we are:
//   osm           a named building on the map
//   osm-blocks    the middle of a hall's named blocks
//   osm-building  the building the place is inside (e.g. the Students' Union)
//   approx        estimated from UWI's description ("near Taylor Hall")
//   owner         pinned by the DormDash owner on Google Maps (most exact)
//   google        the place's own Google Maps pin (owner's store directory;
//                 business pins can be 10-40 m off)
//   missing       not on the map yet: priced at FALLBACK_DELIVERY_FEE_JMD
// To add or move a place: edit the lists below, then regenerate walking
// distances with `node scripts/campus-distances.mjs` (see PRICING.md).
// Keep this file free of imports except ./shared.

import {
  FALLBACK_DELIVERY_FEE_JMD, deliveryFeeForDistance, splitDeliveryFee, STRAIGHT_LINE_WALK_FACTOR,
} from './shared';
import { WALK_M } from './campusDistances';

export type CampusArea = 'hall' | 'faculty' | 'other';
export type PointSource = 'owner' | 'google' | 'osm' | 'osm-blocks' | 'osm-building' | 'approx' | 'missing';
export type CampusPoint = {
  id: string;
  name: string;
  area?: CampusArea;         // delivery points only
  latitude: number | null;
  longitude: number | null;
  source: PointSource;
};

/** The three umbrellas in the checkout picker, in order. */
export const CAMPUS_AREAS: { id: CampusArea; label: string }[] = [
  { id: 'hall', label: 'Halls' },
  { id: 'faculty', label: 'Faculties' },
  { id: 'other', label: 'Other places' },
];

const p = (area: CampusArea, id: string, name: string, latitude: number | null, longitude: number | null, source: PointSource): CampusPoint =>
  ({ id, name, area, latitude, longitude, source });

/** Where students can have food delivered. */
export const DROP_POINTS: CampusPoint[] = [
  // Halls of residence (UWI Mona)
  p('hall', 'aston-preston', 'A.Z. Preston Hall', 18.000833, -76.741944, 'google'),
  p('hall', 'abc', 'ABC Hall', 18.01331, -76.74343, 'owner'),
  p('hall', 'chancellor', 'Chancellor Hall', 18.005922, -76.744644, 'google'),
  p('hall', 'elsa-leo-rhynie', 'Elsa Leo-Rhynie Hall', 18.007665, -76.742895, 'google'),
  p('hall', 'george-alleyne', 'George Alleyne Hall', 17.999009, -76.743634, 'google'),
  p('hall', 'irvine', 'Irvine Hall', 18.006550, -76.743016, 'google'),
  p('hall', 'leslie-robinson', 'Leslie Robinson Hall', 18.00210, -76.74388, 'owner'),
  p('hall', 'marlene-hamilton', 'Marlene Hamilton Hall', 18.000785, -76.745729, 'google'),
  p('hall', 'mary-seacole', 'Mary Seacole Hall', 18.004326, -76.744879, 'google'),
  p('hall', 'rex-nettleford', 'Rex Nettleford Hall', 18.002963, -76.741967, 'google'),
  p('hall', 'taylor', 'Taylor Hall', 18.007414, -76.745013, 'google'),
  // Faculties (UWI Mona has 7)
  p('faculty', 'engineering', 'Faculty of Engineering', 18.00488, -76.75069, 'osm'),
  p('faculty', 'humanities-education', 'Faculty of Humanities and Education', 18.00516, -76.74640, 'osm-blocks'),
  p('faculty', 'law', 'Faculty of Law', 18.00828, -76.74851, 'osm'),
  p('faculty', 'medical-sciences', 'Faculty of Medical Sciences', 18.00944, -76.74665, 'osm'),
  p('faculty', 'science-technology', 'Faculty of Science and Technology', 18.00535, -76.74989, 'osm'),
  p('faculty', 'social-sciences', 'Faculty of Social Sciences', 18.00683, -76.74725, 'owner'),
  p('faculty', 'sport', 'Faculty of Sport', 18.00102, -76.74030, 'approx'),
  // Other well-known places
  p('other', 'main-library', 'Main Library', 18.006041, -76.745659, 'google'),
  p('other', 'students-union', 'Students\u2019 Union', 18.000736, -76.743482, 'google'),
  p('other', 'assembly-hall', 'Assembly Hall (lawn opposite)', 18.005446, -76.747969, 'google'),
  p('other', 'health-centre', 'UWI Health Centre', 18.004224, -76.743730, 'google'),
  p('other', 'nursing', 'UWI School of Nursing (UWISON)', 18.003876, -76.744389, 'google'),
  p('other', 'sas', 'Student Administration Services (SAS)', 18.005781, -76.747583, 'google'),
  p('other', 'student-services', 'Office of Student Services / Lodgings', 18.002794, -76.746750, 'google'),
  p('other', 'sci-eng-library', 'Science and Engineering Library', 18.005308, -76.749463, 'google'),
  p('other', 'mits', 'MITS (IT Services)', 18.003218, -76.745094, 'google'),
  p('other', 'uhwi', 'University Hospital (UHWI)', 18.005568, -76.738775, 'google'),
  p('other', 'undercroft', 'Undercroft', 18.00598, -76.74720, 'osm'),
  p('other', 'philip-sherlock', 'Philip Sherlock Centre', 18.00374, -76.74653, 'osm'),
  p('other', 'chapel', 'UWI Chapel', 18.00360, -76.74800, 'osm'),
  p('other', 'bookshop', 'University Bookshop', 18.00466, -76.74722, 'osm'),
  p('other', 'iflt', 'Interfaculty Lecture Theatre (IFLT)', 18.00566, -76.74881, 'osm'),
  p('other', 'msbm', 'Mona School of Business and Management', 18.00790, -76.74747, 'osm'),
  p('other', 'norman-manley', 'Norman Manley Law School', 18.00711, -76.74677, 'osm'),
  p('other', 'front-gate', 'UWI Front Gate', 18.00306, -76.74981, 'osm'),
  p('other', 'back-gate', 'UWI Back Gate', 18.00523, -76.74240, 'osm'),
  p('other', 'gym', 'UWI Gym', 18.00059, -76.74339, 'osm'),
  p('other', 'post-office', 'UWI Post Office', 18.00052, -76.74691, 'osm'),
  p('other', 'visitors-lodge', 'Mona Visitors\u2019 Lodge', 18.00165, -76.74758, 'osm'),
  p('other', 'confucius', 'Confucius Institute', 18.00244, -76.74465, 'osm'),
  p('other', 'main-parking', 'UWI Main Car Park', 18.00336, -76.74606, 'osm'),
  p('other', 'police', 'UWI Mona Police Station', 17.99775, -76.74409, 'osm'),
];

const f = (id: string, name: string, latitude: number | null, longitude: number | null, source: PointSource): CampusPoint =>
  ({ id, name, latitude, longitude, source });

/**
 * Food spots on campus (the owner's store directory, 29 Sep 2026; Google
 * Maps pins). Each store is linked to one (stores/{id}.pickupPointId).
 */
export const PICKUP_POINTS: CampusPoint[] = [
  // Chancellor / Main Library
  f('kfc', 'KFC', 18.006192, -76.744811, 'google'),
  f('burger-king', 'Burger King', 18.006265, -76.744838, 'google'),
  f('life-is-sweet', 'Life Is Sweet Cafe', 18.006281, -76.744920, 'google'),
  // Taylor / Elsa Leo-Rhynie
  f('taylor-cafeteria', 'Taylor Hall Food', 18.007737, -76.745005, 'google'),
  f('taylor-commissary', 'Taylor Hall Commissary', 18.007563, -76.745173, 'google'),
  f('howlers', 'Howlers Cafe', 18.007585, -76.743080, 'google'),
  // Ring Road north
  f('julie-mango', 'Julie Mango Express', 18.007487, -76.747189, 'google'),
  f('bowl-and-spoon', 'Bowl & Spoon', 18.008614, -76.747271, 'google'),
  // Humanities / Bookshop
  f('beehive', 'Bee Hive', 18.004523, -76.746362, 'google'),
  f('nardos', 'Nardo\u2019s One Stop Shop', 18.004543, -76.746324, 'google'),
  f('pages-cafe', 'Pages Cafe (Bookshop)', 18.004700, -76.747127, 'google'),
  f('juici', 'Juici Patties', 18.004897, -76.748575, 'google'),
  // Mary Seacole / Health Centre
  f('maes-cafeteria', 'Mary Seacole Cafeteria (Mae\u2019s)', 18.004716, -76.744641, 'google'),
  f('social-welfare', 'Social Welfare Canteen', 18.003766, -76.743042, 'google'),
  // Students' Union / Preston
  f('hi-lo', 'Hi-Lo Food Stores', 18.000950, -76.743260, 'google'),
  f('spot', 'The Spot', 18.000881, -76.743380, 'google'),
  f('yaos', 'Yao Chinese Restaurant', 18.000865, -76.743388, 'google'),
  f('preston-cafeteria', 'Preston Cafe', 18.000392, -76.742615, 'google'),
  // University Hospital
  f('mothers-uhwi', 'Mother\u2019s (UHWI)', 18.010904, -76.744929, 'google'),
  f('campus-cafe-uhwi', 'Campus Cafe (UHWI)', 18.012177, -76.743579, 'google'),
];

const byId = (list: CampusPoint[]) => new Map(list.map(x => [x.id, x]));
const DROPS = byId(DROP_POINTS);
const PICKUPS = byId(PICKUP_POINTS);
export const dropPoint = (id: unknown) => (typeof id === 'string' ? DROPS.get(id) : undefined);
export const pickupPoint = (id: unknown) => (typeof id === 'string' ? PICKUPS.get(id) : undefined);

const hasCoords = (x?: CampusPoint): x is CampusPoint & { latitude: number; longitude: number } =>
  !!x && typeof x.latitude === 'number' && typeof x.longitude === 'number';

function straightLineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type DeliveryQuote = {
  feeJmd: number;
  dasherPayoutJmd: number;
  platformFeeJmd: number;
  /** Walking metres store → delivery point; null when priced at the fallback. */
  distanceM: number | null;
  /** 'route' = measured walking route; 'estimate' = straight line × a detour factor; 'fallback' = no position yet. */
  basis: 'route' | 'estimate' | 'fallback';
};

/**
 * The delivery fee and its split for a store's food spot and a delivery
 * point. Measured walking routes first; a straight-line estimate when a
 * pair hasn't been measured yet; the fallback fee when either place has no
 * map position.
 */
export function quoteDelivery(pickupId: unknown, dropId: unknown): DeliveryQuote {
  const from = pickupPoint(pickupId);
  const to = dropPoint(dropId);
  let distanceM: number | null = null;
  let basis: DeliveryQuote['basis'] = 'fallback';
  const routed = from && to ? WALK_M[from.id]?.[to.id] : undefined;
  if (typeof routed === 'number') {
    distanceM = routed;
    basis = 'route';
  } else if (hasCoords(from) && hasCoords(to)) {
    distanceM = Math.round(straightLineM(from, to) * STRAIGHT_LINE_WALK_FACTOR);
    basis = 'estimate';
  }
  const feeJmd = distanceM === null ? FALLBACK_DELIVERY_FEE_JMD : deliveryFeeForDistance(distanceM);
  return { feeJmd, ...splitDeliveryFee(feeJmd), distanceM, basis };
}
