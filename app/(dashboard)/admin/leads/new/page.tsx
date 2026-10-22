"use client";

import { useEffect, useState, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatPhoneInput, PHONE_REGEX } from "@/utils/phoneFormatter";
import { useSearchParams, useRouter } from "next/navigation";
import Loading from "@/components/ui/Loading";
import { toast } from "@/lib/toast";
import {
  User,
  Phone,
  Mail,
  Shield,
  Send,
  ChevronDown,
  Briefcase,
  DollarSign,
  Building,
} from "lucide-react";
import { MultiSelectPolicy } from "@/components/ui/MultiSelectPolicy";
import { ReferralSelect } from "@/components/ui/ReferralSelect";
import {
  PERSONAL_POLICY_TYPES,
  COMMERCIAL_POLICY_TYPES,
} from "@/constants/policyTypes";

function AdminNewLeadContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCategory = searchParams.get("category") || "";
  const initialFlow = searchParams.get("flow") || "new";

  /* ---------------- STATE ---------------- */
  const [isLocked, setIsLocked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [isAdditionalQuote, setIsAdditionalQuote] = useState(false);
  const [existingClient, setExistingClient] = useState<{
    id: string;
    client_name: string;
    source: string;
  } | null>(null);

  const [selectedPolicies, setSelectedPolicies] = useState<string[]>([]);

  const [form, setForm] = useState({
    client_name: "",
    business_name: "",
    phone: "",
    email: "",
    request_type: "",
    insurence_category: initialCategory, // keeping exact original typo
    policy_flow: initialFlow,
    policy_type: "",
    policy_number: "",
    renewal_date: "",
    current_premium: "",
    carrier: "",
    referral: "",
    referral_id: null as string | null,
    notes: "",
    send_email_to_client: false,
  });

  // Sync search parameters with local form state
  useEffect(() => {
    if (initialCategory) {
      setForm((prev) => ({ ...prev, insurence_category: initialCategory }));
    }
  }, [initialCategory]);

  useEffect(() => {
    if (initialFlow) {
      setForm((prev) => ({ ...prev, policy_flow: initialFlow }));
    }
  }, [initialFlow]);

  /* ---------------- DUPLICATE CHECK (REAL-TIME) ---------------- */
  useEffect(() => {
    const checkDuplicates = async () => {
      if (form.phone.length < 10 && !form.email) {
        setExistingClient(null);
        return;
      }
      try {
        let phoneData = null;
        let emailData = null;

        if (form.phone.length === 10) {
          const { data } = await supabase
            .from("clients")
            .select("id, client_name, email")
            .eq("phone", form.phone)
            .maybeSingle();
          phoneData = data;
        }

        if (form.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
          const { data } = await supabase
            .from("clients")
            .select("id, client_name, phone")
            .eq("email", form.email)
            .maybeSingle();
          emailData = data;
        }

        // Conflict: Phone and Email found but they belong to different people
        if (phoneData && emailData && phoneData.id !== emailData.id) {
          setError(
            `Data Mismatch: The phone number belongs to "${phoneData.client_name}" but the email belongs to "${emailData.client_name}".`,
          );
          setExistingClient(null);
          return;
        }

        // Clear error if it was a mismatch error
        if (error?.includes("Data Mismatch")) {
          setError(null);
        }

        const match = phoneData || emailData;
        if (match) {
          const source = phoneData ? "phone" : "email";
          setExistingClient({ ...match, source });

          // Auto-fill
          setForm((prev) => ({
            ...prev,
            client_name: prev.client_name || match.client_name || "",
            phone: prev.phone || (match as any).phone || prev.phone,
            email: prev.email || (match as any).email || prev.email,
          }));
        } else {
          setExistingClient(null);
        }
      } catch (e) {
        console.error("Duplicate check error:", e);
      }
    };

    const timer = setTimeout(checkDuplicates, 500);
    return () => clearTimeout(timer);
  }, [form.phone, form.email]);

  /* ---------------- VALIDATION ---------------- */
  const isPhoneValid = PHONE_REGEX.test(form.phone);
  const isEmailValid =
    !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);

  /* ---------------- INPUT HANDLER ---------------- */
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    if (name === "phone") {
      setForm((prev) => ({ ...prev, phone: formatPhoneInput(value) }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  /* ---------------- CLIENT HELPERS ---------------- */
  const getOrCreateClient = async () => {
    // 1. Check if phone is already in use
    const { data: phoneMatch } = await supabase
      .from("clients")
      .select("id, client_name, email")
      .eq("phone", form.phone)
      .maybeSingle();

    // 2. Check if email is already in use (if provided)
    let emailMatch = null;
    if (form.email) {
      const { data } = await supabase
        .from("clients")
        .select("id, client_name, phone")
        .eq("email", form.email)
        .maybeSingle();
      emailMatch = data;
    }

    // --- LOGIC ---

    // Conflict check: phone and email belong to different people
    if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
      throw new Error(
        `Duplicate Conflict: Phone belongs to "${phoneMatch.client_name}" but Email belongs to "${emailMatch.client_name}".`,
      );
    }

    // Use existing if found by either (prioritizing phone)
    const existing = phoneMatch || emailMatch;
    if (existing) {
      return existing.id;
    }

    // If none found, create NEW
    const { data, error } = await supabase
      .from("clients")
      .insert({
        phone: form.phone,
        email: form.email,
        client_name: form.client_name,
      })
      .select()
      .single();

    if (error) throw error;
    return data.id;
  };

  const checkDuplicateActiveLead = async (clientId: string) => {
    const { data } = await supabase
      .from("temp_leads_basics")
      .select("id, policy_type, current_stage:pipeline_stages!temp_leads_basics_stage_pipeline_fk(stage_name)")
      .eq("client_id", clientId)
      .eq("policy_flow", form.policy_flow)
      .not("current_stage.stage_name", "in", '("Completed","Did Not Bind")');

    if (!data) return false;
    return data.some((d: any) => selectedPolicies.includes(d.policy_type));
  };

  const handleCreateClient = async (forceAdditionalQuote = false) => {
    setError(null);
    setDuplicateWarning(false);

    if (
      !form.client_name ||
      !form.phone ||
      !form.request_type ||
      !form.insurence_category ||
      selectedPolicies.length === 0
    ) {
      setError("Please fill all mandatory fields");
      return;
    }

    if (!isPhoneValid) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }

    if (!isEmailValid) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    setIsLocked(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      setError("User not authenticated");
      setLoading(false);
      setIsLocked(false);
      return;
    }

    try {
      const clientId = await getOrCreateClient();
      const duplicate = await checkDuplicateActiveLead(clientId);

      if (duplicate && !forceAdditionalQuote) {
        setDuplicateWarning(true);
        setLoading(false);
        setIsLocked(false);
        return;
      }

      const leadGroupId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
              /[xy]/g,
              function (c) {
                var r = (Math.random() * 16) | 0,
                  v = c == "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              },
            );

      let finalPipelineId = "";
      if (form.policy_flow === "renewal") {
        const pipelineName =
          form.insurence_category === "commercial"
            ? "Commercial Lines Renewal Pipeline"
            : "Personal Lines Renewal";
        const { data: pData, error: pErr } = await supabase
          .from("pipelines")
          .select("id")
          .eq("name", pipelineName)
          .maybeSingle();
        if (pErr || !pData) {
          setError(
            `Workflow Error: Renewal pipeline "${pipelineName}" not found. Submission halted to maintain data integrity. Please contact system admin.`,
          );
          setLoading(false);
          setIsLocked(false);
          return;
        }
        finalPipelineId = pData.id;
      } else {
        finalPipelineId =
          form.insurence_category === "commercial"
            ? "930d64f7-d10a-4305-9036-67892a6075d3"
            : "f77d068d-1754-421b-b2ce-d527ec8bd0f3";
      }

      // Explicit DE05 Stage Resolution: Fetch stage_order = 1 for target pipeline
      const { data: initialStage, error: stageErr } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("pipeline_id", finalPipelineId)
        .order("stage_order", { ascending: true })
        .limit(1)
        .single();

      if (stageErr || !initialStage) {
        setError("Workflow Error: Initial stage not found for the selected pipeline. Submission halted.");
        setLoading(false);
        setIsLocked(false);
        return;
      }

      const leadsToInsert = selectedPolicies.map((policy) => {
        const { 
          policy_type: _, 
          current_premium: __, 
          renewal_date: ___, 
          policy_number: ____, 
          carrier: _____, 
          ...restForm 
        } = form;
        
        let renewalFields = {};
        if (form.policy_flow === "renewal") {
           renewalFields = {
               policy_number: form.policy_number,
               renewal_date: form.renewal_date,
               current_premium: Number(form.current_premium) || null,
               carrier: form.carrier,
           };
        }

        return {
          ...restForm,
          ...renewalFields,
          policy_type: policy,
          send_email_to_client: form.send_email_to_client ?? false,
          is_additional_quote: forceAdditionalQuote,
          client_id: clientId,
          assigned_csr: null,
          pipeline_id: finalPipelineId,
          current_stage_id: initialStage.id,
          lead_group_id: leadGroupId,
        };
      });

      const { data: insertedLeads, error } = await supabase
        .from("temp_leads_basics")
        .insert(leadsToInsert)
        .select();

      if (error || !insertedLeads || insertedLeads.length === 0) throw error;

      // Phase 2: Insert into lead_policies
      const policiesPayload = insertedLeads.map((insertedLead) => ({
        lead_id: insertedLead.id,
        policy_type: insertedLead.policy_type,
      }));

      const { error: policiesError } = await supabase
        .from("lead_policies")
        .insert(policiesPayload);

      // Phase 3: Error Handling with WARNING strategy
      if (policiesError) {
        console.error(
          "Backend Integration Error - Failed to insert into lead_policies:",
          policiesError,
        );
        toast(
          "Lead was created successfully, but policy records could not be saved. Please contact an administrator.",
          "error",
        );
      } else {
        toast("Lead created successfully (Unassigned)!", "success");
      }
      setIsAdditionalQuote(false);
      setDuplicateWarning(false);
      setForm({
        client_name: "",
        business_name: "",
        phone: "",
        email: "",
        request_type: "",
        insurence_category: initialCategory,
        policy_flow: initialFlow,
        policy_type: "",
        policy_number: "",
        renewal_date: "",
        current_premium: "",
        carrier: "",
        referral: "",
        referral_id: null as string | null,
        notes: "",
        send_email_to_client: false,
      });

      setIsLocked(false);

      if (form.send_email_to_client) {
        toast("Redirecting to email templates...", "info");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setIsLocked(false);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 flex justify-center">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-lg border overflow-hidden">
        <div className="bg-gradient-to-r from-[#10B889] to-[#2E5C85] p-8 text-white">
          <h1 className="text-3xl font-bold">Add New Lead (Admin)</h1>
          <p className="opacity-80 mt-1">
            Create a new lead to distribute. It will initially remain
            unassigned.
          </p>
        </div>

        <div className="p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 text-red-700 rounded animate-in fade-in slide-in-from-left-2">
              <p className="font-semibold flex items-center gap-2">⚠️ Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {existingClient && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 text-blue-800 rounded animate-in fade-in slide-in-from-left-2 shadow-sm">
              <p className="font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                Existing Client Identified
              </p>
              <p className="text-sm mt-1">
                This client is already registered to{" "}
                <strong>"{existingClient.client_name}"</strong>. Details have
                been auto-filled.
              </p>
            </div>
          )}

          {duplicateWarning && (
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 text-yellow-800 rounded animate-in fade-in slide-in-from-left-2 shadow-sm">
              <p className="font-semibold flex items-center gap-2">
                ⚠️ Duplicate Warning
              </p>
              <p className="text-sm mt-1 mb-3">
                An active policy already exists for this client with the
                selected policy type.
              </p>
              <button
                onClick={() => handleCreateClient(true)}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium text-sm transition-colors"
              >
                Proceed as Additional Quote
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              icon={<User />}
              name="client_name"
              value={form.client_name}
              onChange={handleChange}
              placeholder="Client Name *"
              disabled={isLocked}
            />
            {form.insurence_category === "commercial" && (
              <Input
                icon={<Briefcase />}
                name="business_name"
                value={form.business_name}
                onChange={handleChange}
                placeholder="Business Name"
                disabled={isLocked}
              />
            )}
            <Input
              icon={<Phone />}
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Phone *"
              disabled={isLocked}
              inputMode="numeric"
              maxLength={14}
              error={
                form.phone.length > 0 && !isPhoneValid
                  ? "Enter valid mobile number"
                  : undefined
              }
            />

            <Input
              icon={<Mail />}
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Email"
              disabled={isLocked}
              error={
                form.email.length > 0 && !isEmailValid
                  ? "Enter valid mail"
                  : undefined
              }
            />
            <Select
              name="request_type"
              value={form.request_type}
              onChange={handleChange}
              placeholder="Request Type *"
              options={[
                { value: "new_lead", label: "New Lead" },
                { value: "endorsement", label: "Endorsement" },
                { value: "cancellation", label: "Cancellation" },
                { value: "carrier_request", label: "Carrier Request" },
              ]}
            />
            {!initialCategory && (
              <Select
                name="insurence_category"
                value={form.insurence_category}
                onChange={handleChange}
                placeholder="Insurance Category *"
                options={[
                  { value: "personal", label: "Personal" },
                  { value: "commercial", label: "Commercial" },
                ]}
              />
            )}
          </div>

          {form.policy_flow === "renewal" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 p-6 border rounded-xl bg-slate-50">
              <div className="col-span-1 md:col-span-2">
                <h3 className="font-semibold text-slate-800 text-sm tracking-tight mb-2">Renewal Details</h3>
              </div>
              <Input
                icon={<Shield />}
                name="policy_number"
                value={form.policy_number}
                onChange={handleChange}
                placeholder="Current Policy Number *"
                disabled={isLocked}
              />
              <Input
                icon={<Mail />}
                type="date"
                name="renewal_date"
                value={form.renewal_date}
                onChange={handleChange}
                placeholder="Renewal Date *"
                disabled={isLocked}
              />
              <Input
                icon={<DollarSign />}
                type="number"
                name="current_premium"
                value={form.current_premium}
                onChange={handleChange}
                placeholder="Current Premium *"
                disabled={isLocked}
              />
              <Input
                icon={<Building />}
                name="carrier"
                value={form.carrier}
                onChange={handleChange}
                placeholder="Current Carrier (Optional)"
                disabled={isLocked}
              />
            </div>
          )}

          <div className="col-span-1 md:col-span-2 mt-6">
            <MultiSelectPolicy
              selectedValues={selectedPolicies}
              onChange={setSelectedPolicies}
              error={
                selectedPolicies.length === 0
                  ? "Please select at least one policy type"
                  : false
              }
              options={
                form.insurence_category === "commercial"
                  ? COMMERCIAL_POLICY_TYPES
                  : PERSONAL_POLICY_TYPES
              }
            />
          </div>

          <div className="col-span-1 md:col-span-2">
            <ReferralSelect 
              value={form.referral_id || ""}
              onChange={(id, name) => setForm((prev) => ({ ...prev, referral_id: id || null, referral: name }))}
            />
          </div>

          <textarea
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Additional Notes..."
            className="w-full border rounded-xl p-4"
          />

          <button
            onClick={() => handleCreateClient()}
            disabled={loading}
            className="w-full py-4 bg-gray-800 hover:bg-gray-900 transition-colors text-white rounded-xl font-bold flex justify-center gap-2"
          >
            {loading ? "Creating..." : "Create Lead"}
            {!loading && <Send />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminNewLeadPage() {
  return (
    <Suspense
      fallback={<Loading message="Initializing new lead form..." fullScreen />}
    >
      <AdminNewLeadContent />
    </Suspense>
  );
}

/* ---------------- UI HELPERS ---------------- */

const Input = ({
  icon,
  error,
  ...props
}: {
  icon: React.ReactNode;
  error?: string | boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="flex flex-col gap-1 w-full">
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
        {icon}
      </div>
      <input
        {...props}
        className={`w-full pl-12 pr-4 py-3 rounded-xl border transition outline-none
          ${
            error
              ? "border-red-500 focus:ring-2 focus:ring-red-200"
              : "border-gray-300 focus:ring-2 focus:ring-gray-200"
          }`}
      />
    </div>
    {typeof error === "string" && error && (
      <span className="text-red-500 text-[11px] font-medium ml-1 animate-in fade-in slide-in-from-top-1">
        {error}
      </span>
    )}
  </div>
);

const Select = ({ options, placeholder, ...props }: any) => (
  <div className="relative">
    <select
      {...props}
      className="w-full px-4 py-3 border rounded-xl appearance-none bg-white"
    >
      <option value="">{placeholder}</option>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <ChevronDown
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      size={16}
    />
  </div>
);
