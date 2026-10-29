import { formatCurrency } from './currency';
import { formatDateOnly } from '@/utils/dateHelper';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  policy_type?: string;
  policy_flow?: string;
  insurance_category?: string;
}

export interface PolicyBreakdown {
  id: string;
  type: string;
  cName: string;   // Current Carrier
  nName: string;   // New Carrier
  term: string;
  a1: string;      // Current/Old Premium
  a2: string;      // New Premium
  driver?: string;
  vehicle?: string;
  vin?: string;
  oldPremium?: string;
  newPremium?: string;
  templateId?: string;
  policyFlow?: string;
}

export interface EmailData {
  clientName: string;
  effDate: string;
  singleCarrier: string;
  defCurrentCarrier: string;
  defNewCarrier: string;
  payType: string;
  last4: string;
  manualYear: string;
  policies: PolicyBreakdown[];
}

export interface CsrData {
  full_name?: string;
  email?: string;
  phone?: string;
}

export function getCombinedTypes(policies: PolicyBreakdown[]): string {
  if (!policies || policies.length === 0) return 'Insurance';
  const types = Array.from(new Set(policies.map(p => p.type)));
  return types.join(' / ');
}

export function calculateTotalSavings(policies: PolicyBreakdown[]): string {
  let totalSavings = 0;
  policies.forEach(p => {
    // Check both legacy a1/a2 and new old/newPremium fields
    const oldVal = parseFloat(p.oldPremium || p.a1) || 0;
    const newVal = parseFloat(p.newPremium || p.a2) || 0;
    if (oldVal && newVal) {
      totalSavings += (oldVal - newVal);
    }
  });
  return totalSavings > 0 ? formatCurrency(totalSavings) : formatCurrency(0);
}

export function generatePolicyBreakdown(templateKey: string, policies: PolicyBreakdown[]): string {
  if (!policies || policies.length === 0) return '';
  
  // Specific formatting for different template types
  if (templateKey === 'renewal_same') {
    return policies.map((p, idx) => `• <b>Policy ${idx + 1}: ${p.type} Insurance Premium:</b> ${formatCurrency(p.oldPremium || p.newPremium || p.a1 || p.a2 || 0)}`).join('<br>');
  } 
  if (templateKey === 'renewal_switch') {
    return policies.map((p, idx) => `<b>Policy ${idx + 1}: ${p.type} Policy Comparison:</b><br>• Current ${p.cName || '[Carrier]'} Carrier (Renewal Premium): ${formatCurrency(p.oldPremium || p.a1 || 0)}<br>• New ${p.nName || '[New Carrier]'} Carrier (Quoted Premium): ${formatCurrency(p.newPremium || p.a2 || 0)}`).join('<br><br>');
  }
  if (templateKey === 'payment_reminder') {
    return policies.map((p, idx) => `• <b>Policy ${idx + 1}: ${p.type} Insurance</b> with ${p.cName || '[Carrier]'}: <b>${formatCurrency(p.oldPremium || p.newPremium || p.a1 || p.a2 || 0)}</b>`).join('<br>');
  }
  if (templateKey === 'new_lead') {
    return policies.map((p, idx) => `<b>Policy ${idx + 1}: ${p.type} Insurance Quote:</b><br>Carrier: ${p.cName || '[Carrier]'}<br>Coverage Term: ${p.term || '12 months'}<br>Premium Amount: <b>${formatCurrency(p.oldPremium || p.newPremium || p.a1 || p.a2 || 0)}</b>`).join('<br><br>');
  }

  // Refined production format with numbering and auto-skipping empty fields
  return policies.map((p, idx) => {
    let lines = [`<b>Policy ${idx + 1}:</b>`];
    
    const pType = p.type ? p.type.toLowerCase() : '';
    const isAutoLayout = pType === 'auto' || pType === 'motorcycle';
    
    lines.push(`Type: ${p.type} Insurance`);
    
    if (isAutoLayout) {
      if (p.driver) lines.push(`Driver: ${p.driver}`);
      if (p.vehicle) lines.push(`Vehicle: ${p.vehicle}`);
      if (p.vin) lines.push(`VIN: ${p.vin}`);
    }
    
    if (p.cName) lines.push(`Carrier: ${p.cName}`);
    else if (p.nName) lines.push(`Carrier: ${p.nName}`);

    // Determine the premium to show
    const currentPrem = p.oldPremium || p.a1;
    const newPrem = p.newPremium || p.a2;

    if (currentPrem && newPrem) {
      lines.push(`Current Premium: ${formatCurrency(currentPrem)}`);
      lines.push(`New Premium: ${formatCurrency(newPrem)}`);
    } else if (newPrem) {
      lines.push(`Premium: ${formatCurrency(newPrem)}`);
    } else if (currentPrem) {
      lines.push(`Premium: ${formatCurrency(currentPrem)}`);
    }
    
    return lines.join('<br>') + '<br>';
  }).join('<br>');
}

export function generateDynamicSections(policies: PolicyBreakdown[]): { sections: string, counter: number } {
  console.log('--- generateDynamicSections INPUT ---', JSON.stringify(policies, null, 2));
  let sections = '';
  let counter = 1;
  const processedCategories = new Set<string>();
  
  if (policies && policies.length > 0) {
    policies.forEach(p => {
    const type = (p.type || '').toLowerCase();
    console.log('ITERATING POLICY TYPE:', p.type, '->', type);
    
    if (['home', 'condo', 'landlord_home', 'landlord_condo'].includes(type)) {
      console.log(`MATCHED PROPERTY CASE for type: ${type}`);
      if (!processedCategories.has('property')) {
        sections += `<b>${counter}. Property Insurance Details</b><br>• A copy of your current property insurance policy OR<br>• For a new purchase: a copy of the purchase agreement along with your current address<br><br>`;
        counter++;
        processedCategories.add('property');
      } else {
        console.log(`SKIPPED PROPERTY CASE for type ${type} because 'property' is already processed.`);
      }
    } else if (['auto', 'motorcycle'].includes(type)) {
      console.log(`MATCHED VEHICLE CASE for type: ${type}`);
      if (!processedCategories.has('vehicle')) {
        sections += `<b>${counter}. Driver & Vehicle Information</b><br>• Driver’s licenses for all household drivers<br>• Vehicle Identification Numbers (VINs) for all vehicles<br><br>`;
        counter++;
        processedCategories.add('vehicle');
      } else {
        console.log(`SKIPPED VEHICLE CASE for type ${type} because 'vehicle' is already processed.`);
      }
    } else if (type === 'umbrella') {
      console.log(`MATCHED UMBRELLA CASE for type: ${type}`);
      if (!processedCategories.has('umbrella')) {
        sections += `<b>${counter}. Umbrella Coverage Details</b><br>• A copy of your current underlying home and auto insurance declaration pages<br><br>`;
        counter++;
        processedCategories.add('umbrella');
      } else {
        console.log(`SKIPPED UMBRELLA CASE for type ${type} because 'umbrella' is already processed.`);
      }
    } else {
      console.log(`NO CASE MATCHED for type: ${type}`);
    }
  });
  }

  sections += `<b>${counter}. Additional Information Form</b><br>For your convenience, we have provided a link to the intake form that collects additional details needed to ensure quote accuracy.<br><br>`;
  counter++;

  return { sections, counter };
}

export function replaceTemplate(templateKey: string, templateString: string, data: EmailData, leadData?: any, formLink?: string, csrData?: CsrData, notes?: string): string {
  if (!templateString) return '';
  
  // Normalize key for logic matching
  const normalizedKey = templateKey.toLowerCase().replace(/\s+/g, '_');

  let activeTemplateString = templateString;

  if (normalizedKey === 'info_req' && (templateString.includes('Dear') || templateString.includes('\n'))) {
    let activePolicyTypes = data.policies.map(p => p.type.toLowerCase());
    if (activePolicyTypes.length === 0) {
      if (leadData?.lead_policies && leadData.lead_policies.length > 0) {
        activePolicyTypes = leadData.lead_policies.map((p: any) => (p.policy_type || '').toLowerCase());
      } else if (leadData?.policy_type) {
        activePolicyTypes = [leadData.policy_type.toLowerCase()];
      } else {
        activePolicyTypes = ['home'];
      }
    }

    const hasProperty = activePolicyTypes.some(t => ['home', 'condo', 'landlord_home', 'landlord_condo'].includes(t));
    const hasVehicle = activePolicyTypes.some(t => ['auto', 'motorcycle'].includes(t));
    const hasUmbrella = activePolicyTypes.some(t => t === 'umbrella');

    let dynamicBody = `Dear {{client_name}},\n\nThank you for reaching out to Innovative Insurance. We appreciate the opportunity to assist you and look forward to preparing a competitive and accurate insurance quote tailored to your needs.\n\nTo proceed, we kindly request the following items:\n\n`;
    let counter = 1;

    if (hasProperty) {
      dynamicBody += `${counter}. Property Insurance Details\n• A copy of your current property insurance policy OR\n• For a new purchase: a copy of the purchase agreement along with your current address\n\n`;
      counter++;
    }
    if (hasVehicle) {
      dynamicBody += `${counter}. Driver & Vehicle Information\n• Driver’s licenses for all household drivers and insured individuals\n• Vehicle Identification Numbers (VINs) for all vehicles\n*(Note: If you provide your current auto policy declarations page, we can collect VIN information directly from it.)*\n\n`;
      counter++;
    }
    if (hasUmbrella) {
      dynamicBody += `${counter}. Umbrella Requirements\n• A copy of your current underlying home and auto insurance declaration pages (if not already provided)\n\n`;
      counter++;
    }

    dynamicBody += `${counter}. Additional Information Form\nFor your convenience, please complete our secure online intake form to provide the additional details needed to ensure quote accuracy. This form includes a few important information fields and a brief questionnaire that helps us apply all eligible discounts.\n\nComplete your form here: {{form_link}}\n\n`;

    dynamicBody += `Providing these items helps us prepare the most accurate quote and prevents any last-minute changes, as insurance reports are processed only at the time of binding.\n\nThank you once again for considering Innovative Insurance. If you have any questions or need assistance completing the form, please feel free to reach out.`;

    activeTemplateString = dynamicBody;
  }

  const combinedTypes = getCombinedTypes(data.policies);
  const totalSavings = calculateTotalSavings(data.policies);
  const breakdown = generatePolicyBreakdown(normalizedKey, data.policies);
  
  const { sections: dynamicSections, counter: formCounter } = generateDynamicSections(data.policies);
  
  const idText = '';
  const pluralPol = data.policies.length > 1 ? 'policies' : 'policy';

  // Sourcing singular values from the first policy if available
  const firstPolicy = data.policies[0];
  const activeCarrier = firstPolicy?.cName || data.singleCarrier || '';
  const activePremium = firstPolicy?.a1 || firstPolicy?.oldPremium || firstPolicy?.newPremium || firstPolicy?.a2 || '';
  const activeTerm = firstPolicy?.term || '12 months';

  const replacements: Record<string, string> = {
    // Output Standard: Relying on breakdown and aggregate savings
    policy_breakdown: breakdown,
    bullets: breakdown,
    savings_amount: totalSavings,
    savings_breakdown: totalSavings,

    // Core variables
    client_name: data.clientName || leadData?.client_name || '',
    combined_types: combinedTypes,
    eff_date: data.effDate || '',
    effective_date: data.effDate || '',
    renewal_date: leadData?.renewal_date ? formatDateOnly(leadData.renewal_date) : data.effDate || '',
    single_carrier: data.singleCarrier || activeCarrier || '',
    manual_year: data.manualYear || '',
    dynamic_sections: dynamicSections,
    counter: formCounter.toString(),
    pay_type: data.payType || 'Bank Account',
    last4: data.last4 || '',
    id_text: idText,
    plural_pol: pluralPol,

    // Singular fallbacks and extracted policy fields
    current_carrier: data.defCurrentCarrier || firstPolicy?.cName || '',
    new_carrier: data.defNewCarrier || firstPolicy?.nName || '',
    driver: firstPolicy?.driver || '',
    vehicle: firstPolicy?.vehicle || '',
    vin: firstPolicy?.vin || '',
    
    premium: activePremium ? formatCurrency(activePremium) : '',
    premium_amount: activePremium ? formatCurrency(activePremium) : '',
    old_premium: firstPolicy?.oldPremium || firstPolicy?.a1 ? formatCurrency(firstPolicy?.oldPremium || firstPolicy?.a1) : '',
    new_premium: firstPolicy?.newPremium || firstPolicy?.a2 ? formatCurrency(firstPolicy?.newPremium || firstPolicy?.a2) : '',
    renewal_premium: leadData?.renewal_premium ? formatCurrency(leadData.renewal_premium) : (firstPolicy?.newPremium || firstPolicy?.a2 ? formatCurrency(firstPolicy?.newPremium || firstPolicy?.a2) : ''),
    carrier: activeCarrier || '',
    term: activeTerm,
    form_link: formLink ? `<a href="${formLink}" style="color: #10B889; font-weight: bold; text-decoration: underline;">Click Here to Fill Form</a>` : '{{form_link}}',
    form_links: formLink ? `<a href="${formLink}" style="color: #10B889; font-weight: bold; text-decoration: underline;">Click Here to Fill Form</a>` : '{{form_link}}',

    // CSR Data
    csr_name: csrData?.full_name || '',
    csr_email: csrData?.email || '',
    csr_phone: csrData?.phone || '',

    // Extended Support for Template Builder Fields
    email: leadData?.email || '',
    phone: leadData?.phone || '',
    policy_type: data.policies[0]?.type || leadData?.policy_type || '',
    pipeline_name: leadData?.pipeline?.name || leadData?.pipeline_name || '',
    status: leadData?.status || '',
    notes: notes || leadData?.notes || ''
  };

  let output = activeTemplateString;

  // New Generalized Replacement Engine
  // Matches: {{ variable_name }} OR [Variable Name] OR $[Variable Name] etc.
  // The currency format in legacy templates might be $[Premium]. We should match the brackets without the $ and let formatCurrency apply.
  const combinedRegex = /(?:\{\{\s*(.*?)\s*\}\})|(?:\[\s*(.*?)\s*\])/g;

  output = output.replace(combinedRegex, (match, p1, p2) => {
    const rawKey = p1 || p2;
    if (!rawKey) return match;

    // Normalize: e.g., "Client Name", "client_name", " Client Name " -> "client_name"
    const normalizedMatchKey = rawKey.trim().toLowerCase().replace(/\s+/g, '_');

    if (normalizedMatchKey in replacements) {
      const val = replacements[normalizedMatchKey];
      return val !== undefined && val !== null ? val.toString() : '';
    }

    // Preserve form_link if it wasn't replaced yet
    if (normalizedMatchKey === 'form_link') {
      return '{{form_link}}';
    }

    // Unmapped placeholders default to empty string for graceful degradation
    return '';
  });

  // Handle legacy $[tag] where formatCurrency already includes the $ sign
  output = output.replace(/\$\$/g, '$');
  
  return output;
}

export function replaceCombinedTemplate(
  templateName: string,
  policyFlow: string,
  data: EmailData,
  leadData: any,
  allTemplates: EmailTemplate[],
  formLink?: string,
  csrData?: CsrData,
  notes?: string
): { subject: string; body: string } {
  if (!templateName) return { subject: '', body: '' };

  const normalizedKey = templateName.toLowerCase().replace(/\s+/g, '_');

  // If it's info_req, keep the existing dynamic replacement logic
  if (normalizedKey === 'info_req') {
    const defaultTemplate = allTemplates.find(t => t.name.toLowerCase() === 'info_req') || allTemplates[0];
    if (!defaultTemplate) return { subject: '', body: '' };
    const subject = replaceTemplate(templateName, defaultTemplate.subject, data, leadData, formLink, csrData, notes);
    const body = replaceTemplate(templateName, defaultTemplate.body, data, leadData, formLink, csrData, notes);
    return { subject, body };
  }

  // Collect policy types
  let activePolicyTypes: string[] = [];
  if (data.policies && data.policies.length > 0) {
    activePolicyTypes = data.policies.map(p => p.type.toLowerCase());
  } else if (leadData?.lead_policies && leadData.lead_policies.length > 0) {
    activePolicyTypes = leadData.lead_policies.map((p: any) => (p.policy_type || '').toLowerCase());
  } else if (leadData?.policy_type) {
    activePolicyTypes = [leadData.policy_type.toLowerCase()];
  } else {
    activePolicyTypes = ['home'];
  }

  // Deduplicate policy types
  const normalizedTypes = Array.from(new Set(activePolicyTypes.map(t => t.trim().toLowerCase())));

  // Retrieve templates for each policy type
  const matchingTemplates = normalizedTypes.map(pType => {
    return allTemplates.find(t => 
      t.name.toLowerCase() === templateName.toLowerCase() &&
      (t.policy_flow || '').toLowerCase() === (policyFlow || '').toLowerCase() &&
      (t.policy_type || '').toLowerCase() === pType
    );
  }).filter((t): t is EmailTemplate => !!t);

  // If we only have 0 or 1 matching template, proceed as normal
  if (matchingTemplates.length <= 1) {
    const template = matchingTemplates[0] || allTemplates.find(t => t.name.toLowerCase() === templateName.toLowerCase()) || allTemplates[0];
    if (!template) return { subject: '', body: '' };
    const subject = replaceTemplate(templateName, template.subject, data, leadData, formLink, csrData, notes);
    const body = replaceTemplate(templateName, template.body, data, leadData, formLink, csrData, notes);
    return { subject, body };
  }

  // Extract common prefix/suffix and policy-specific sections
  const normalizedBodies = matchingTemplates.map(t => {
    let res = t.body.replace(/\r\n/g, '\n');
    res = res.replace(/^(Dear\s+[^,\n]+,\n)(?!\n)/i, '$1\n');
    res = res.replace(/(We hope this email finds you well\.\n)(?!\n)/i, '$1\n');
    return res;
  });
  const paragraphLists = normalizedBodies.map(body => 
    body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  );

  const minParagraphs = Math.min(...paragraphLists.map(list => list.length));

  let commonPrefixCount = 0;
  for (let i = 0; i < minParagraphs; i++) {
    const p = paragraphLists[0][i];
    const allMatch = paragraphLists.every(list => list[i] === p);
    if (allMatch) {
      commonPrefixCount++;
    } else {
      break;
    }
  }

  let commonSuffixCount = 0;
  for (let i = 1; i <= minParagraphs - commonPrefixCount; i++) {
    const index0 = paragraphLists[0].length - i;
    const p = paragraphLists[0][index0];
    const allMatch = paragraphLists.every(list => list[list.length - i] === p);
    if (allMatch) {
      commonSuffixCount++;
    } else {
      break;
    }
  }

  const unreplacedHeader = paragraphLists[0].slice(0, commonPrefixCount).join('\n\n');
  const unreplacedFooter = paragraphLists[0].slice(paragraphLists[0].length - commonSuffixCount).join('\n\n');

  const unreplacedSections = paragraphLists.map(list => 
    list.slice(commonPrefixCount, list.length - commonSuffixCount).join('\n\n')
  );

  // Perform placeholder replacement on each section using data filtered by policy type
  const replacedSections = matchingTemplates.map((tpl, index) => {
    const pType = normalizedTypes[index];
    
    // Filter policy breakdowns in data.policies for this specific type
    const typePolicies = data.policies.filter(p => p.type.toLowerCase() === pType);
    
    const sectionData: EmailData = {
      ...data,
      policies: typePolicies.length > 0 ? typePolicies : [{
        id: Math.random().toString(),
        type: pType,
        cName: '',
        nName: '',
        term: '12 months',
        a1: '',
        a2: ''
      }]
    };

    const sectionText = unreplacedSections[index];
    return replaceTemplate(templateName, sectionText, sectionData, leadData, formLink, csrData, notes);
  });

  // Replaced header and footer with full data
  const replacedHeader = replaceTemplate(templateName, unreplacedHeader, data, leadData, formLink, csrData, notes);
  const replacedFooter = replaceTemplate(templateName, unreplacedFooter, data, leadData, formLink, csrData, notes);

  let combinedBody = '';
  if (replacedHeader) combinedBody += replacedHeader + '\n\n';
  combinedBody += replacedSections.filter(Boolean).join('\n\n<hr style="border: 0; border-top: 1px solid #ccc; margin: 20px 0;">\n\n');
  if (replacedFooter) combinedBody += '\n\n' + replacedFooter;

  // Generate subject using the first template
  const subjectTemplate = matchingTemplates[0];
  const subject = replaceTemplate(templateName, subjectTemplate.subject, data, leadData, formLink, csrData, notes);

  return { subject, body: combinedBody };
}

