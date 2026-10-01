'use strict';

// Representative bookings for checking correspondence against the EV Exec
// standard. Shapes match real rows in public.bookings.

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  customer_name: 'Alex Test',
  customer_phone: '+447700900123',
  customer_email: 'alex@example.com',
  passengers: 2,
  luggage: '2 large',
  status: 'Dispatched',
  travel_date: '2026-10-03',
  travel_time: '14:00:00',
  quoted_price: 90,
  payment_method: null,
  payment_status: 'Unpaid',
  return_journey: false,
  notes: null
};

const HOME = '12 Example Road, Lytham St Annes, FY8 1AB, UK';
const MAN_T2 = 'Manchester Airport Terminal 2, Manchester M90 1QX, UK';

module.exports = {
  HOME, MAN_T2,
  oneWay: { ...base, ref: 'EVX-ONEWAY', journey_type: 'To Airport', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2 },
  returnTrip: {
    ...base, ref: 'EVX-RETURN', journey_type: 'To Airport', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2,
    quoted_price: 160, return_journey: true, return_pickup: MAN_T2, return_airport: 'Manchester Airport',
    return_date: '2026-10-10', return_time: '18:35', return_destination: HOME
  },
  returnLegRow: {
    ...base, ref: 'EVX-RETLEG', journey_type: 'From Airport', pickup_location: MAN_T2, airport: 'Manchester Airport', dropoff_address: HOME,
    travel_date: '2026-10-10', travel_time: '18:35', quoted_price: 0,
    notes: 'Return leg created automatically from return booking. Original return fare: £160. Outbound ref: EVX-RETURN'
  },
  withStops: {
    ...base, ref: 'EVX-STOPS', journey_type: 'To Airport', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2,
    quoted_price: 100, notes: 'Stop 1: 5 Church Street, Kirkham, PR4 2SE\nStop 2: 9 Station Road, Preston, PR1 1AA'
  },
  airportPickup: {
    ...base, ref: 'EVX-ARRIVE', journey_type: 'From Airport', airport: 'Liverpool Airport',
    pickup_location: 'Liverpool John Lennon Airport Arrivals, Speke Hall Avenue, Liverpool, L24 1YD',
    dropoff_address: '3 Beach Road, Fleetwood, FY7 8AB', travel_time: '06:05'
  },
  unpaid: { ...base, ref: 'EVX-UNPAID', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2 },
  cash: { ...base, ref: 'EVX-CASH', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'Cash', payment_status: 'Unpaid' },
  cashWebsite: { ...base, ref: 'EVX-CASH2', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'cash', payment_status: 'Invoiced' },
  card: { ...base, ref: 'EVX-CARD', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'Card', payment_status: 'Paid', completed_at: '2026-10-03T13:58:00Z' },
  bank: { ...base, ref: 'EVX-BANK', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'Bank Transfer', payment_status: 'Invoiced' },
  bankPaid: { ...base, ref: 'EVX-BANKP', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'Bank Transfer', payment_status: 'Paid' },
  linkPending: { ...base, ref: 'EVX-LINK', pickup_location: HOME, airport: 'Manchester Airport', dropoff_address: MAN_T2, payment_method: 'Payment link', payment_status: 'Unpaid' }
};
