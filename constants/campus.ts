// constants/campus.ts
// UWI Mona places and delivery quotes for the app. One copy, shared with the
// server (functions/src/campus.ts), so the fee a student sees at checkout is
// the fee verifyNewOrder charges.
export {
  CAMPUS_AREAS, DROP_POINTS, PICKUP_POINTS, dropPoint, pickupPoint, quoteDelivery,
} from '../functions/src/campus';
export type { CampusArea, CampusPoint, DeliveryQuote } from '../functions/src/campus';
