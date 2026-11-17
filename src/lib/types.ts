export type Availability = "available" | "reserved" | "loaned";

export interface CatalogBook {
  id: string;
  title: string;
  author: string | null;
  summary: string | null;
  category: string | null;
  audience: string | null;
  language: string;
  series: string | null;
  series_number: number | null;
  tags: string[];
  cover_url: string | null;
  is_sample: boolean;
  created_at: string;
  status: Availability;
}

export interface AdminBook extends CatalogBook {
  location: string | null;
  source_scan_id: string | null;
  archived_at: string | null;
  updated_at: string;
  holder_name: string | null;
}

export interface Borrower {
  id: string;
  name: string;
  phone: string;
  phone_normalized: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  book_id: string;
  borrower_id: string;
  loaned_at: string;
  due_date: string | null;
  returned_at: string | null;
  note: string | null;
  reservation_id: string | null;
  book?: { id: string; title: string; author: string | null } | null;
  borrower?: { id: string; name: string; phone: string } | null;
}

export type ReservationStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired" | "fulfilled";

export interface Reservation {
  id: string;
  book_id: string;
  requester_name: string;
  requester_phone: string;
  phone_normalized: string;
  status: ReservationStatus;
  requested_at: string;
  approved_at: string | null;
  expires_at: string | null;
  resolved_at: string | null;
  borrower_id: string | null;
  loan_id: string | null;
  book?: { id: string; title: string; author: string | null } | null;
}

export const STATUS_LABEL: Record<Availability, string> = {
  available: "פנוי",
  reserved: "שמור",
  loaned: "מושאל",
};

export const RESERVATION_LABEL: Record<ReservationStatus, string> = {
  pending: "ממתינה לאישור",
  approved: "מאושרת",
  rejected: "נדחתה",
  cancelled: "בוטלה",
  expired: "פג תוקפה",
  fulfilled: "נמסר",
};
