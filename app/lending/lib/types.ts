export interface LendingPartner {
  id?: string;
  loan_id?: string;
  full_name: string;
  mobile?: string;
  email?: string;
  ownership_percent: number;
  citizenship_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LendingBank {
  id: string;
  bank_name: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LendingLoanBank {
  id?: string;
  loan_id?: string;
  bank_id?: string;
  bank?: { bank_name: string }; // joined relation
  bank_officer_name?: string;
  bank_underwriter_name?: string;
  title_agency_name?: string;
  bank_closing_agent_name?: string;
  contact_email?: string;
  contact_phone?: string;
  bank_amount_requested?: number;
  bank_amount_received?: number;
  // Temporary UI fields used before save
  lender_bank?: string; 
  is_custom_bank?: boolean;
  display_order?: number;
  is_final_lender?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AccurateLendingLoan {
  id: string;
  borrower_name: string;
  client_legal_name?: string;
  client_phone?: string;
  client_email?: string;
  inquiry_date?: string;
  loan_type?: string;
  loan_purpose?: string;
  nature_of_loan?: string;
  business_address?: string;
  loan_summary?: string;
  purchase_price?: number;
  down_payment_percent?: number;
  
  // Amounts
  accutax_amount_requested?: number;
  accurate_lending_amount_requested?: number;
  internal_amount_received?: number;
  
  lead_source?: string;
  referral_name?: string;
  current_stage?: string;
  status?: string;
  assigned_user?: string;
  created_by?: string;
  
  // Custom UI fields that map to stage checks or notes
  broker_commission?: number;
  estimated_credit_score?: number;

  // Relations (loaded for display)
  partners?: LendingPartner[];
  banks?: LendingLoanBank[];

  created_at: string;
  updated_at: string;
}

export interface LendingStageHistory {
  id: string;
  loan_id: string;
  previous_stage: string;
  current_stage: string;
  updated_by?: string;
  remarks?: string;
  stage_data?: Record<string, any>;
  changed_at: string;
  updater?: {
    id: string;
    full_name?: string;
    email?: string;
    role?: string;
  } | null;
  loan?: {
    id: string;
    borrower_name?: string;
    loan_type?: string;
    current_stage?: string;
    status?: string;
  } | null;
}

