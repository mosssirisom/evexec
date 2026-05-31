export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'active'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  contact_method: string | null;
  journey_type: 'To Airport' | 'From Airport';
  pickup_location: string | null;
  airport: string | null;
  flight_number: string | null;
  dropoff_address: string | null;
  travel_date: string;
  travel_time: string | null;
  passengers: number;
  luggage: string | null;
  return_journey: boolean;
  return_pickup: string | null;
  return_airport: string | null;
  return_flight: string | null;
  return_date: string | null;
  return_time: string | null;
  return_destination: string | null;
  status: BookingStatus;
  quoted_price: number | null;
  payment_method: string | null;
  assigned_driver_id: string | null;
  driver_notes: string | null;
  updated_at: string | null;
}

export interface Driver {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_registration: string | null;
  vehicle_model: string | null;
  is_online: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
