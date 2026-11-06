// Raw document shapes, as in data/synthetic*_db.json (field meanings: data/FIELDS.md).

export interface MedicationAdministration { id: string; time: string; name: string; value: number }

export interface TrackerSubmission {
  trackerId: string;
  date: string; // ISO UTC
  responses: { questionId: string; value: string }[]; // [] = blank submission
}

export interface DailyLog {
  day: string; // YYYY-MM-DD
  allMedicationsAdministered: boolean;
  trackerResponses?: TrackerSubmission[];
  medicationAdministrations?: MedicationAdministration[];
}

export interface Medication {
  id: string;
  name: string;
  howOften: string;
  icon: string;
  relatedCondition: string;
  archived: boolean;
  index: number;
  dosage: {
    timing: { periodUnit: string | null; frequency: number | null; period: number | null };
    asNeeded: boolean;
  };
}

export interface FvcPlusResults {
  fev1: number; fev1Predicted: number; fev1PercentPredicted: number;
  fvc: number; fvcPredicted: number; fvcPercentPredicted: number;
  fev1FvcPercent: number;
  pef: number; pefPredicted: number; pefPercentPredicted: number;
  fev6: number | null; fef2575: number | null;
  unlabeled1: unknown; unlabeled2: unknown;
}

interface ReadingBase {
  date: string; // ISO UTC
  accepted: boolean;
  qualityReport: { quality: string; qualityIndications: { message: string }[] };
}

/** Spirometer (asthma, cystic fibrosis). */
export interface Blow extends ReadingBase { fvcPlusResults: FvcPlusResults }
/** Glucose meter (type 1 diabetes); glucose is null when the strip failed. */
export interface GlucoseReading extends ReadingBase {
  glucoseResults: { glucose: number | null; unit: "mg/dL"; mealContext: string };
}
/** Pulse oximeter (congenital heart disease). */
export interface OximetryReading extends ReadingBase {
  oximetryResults: { spo2: number; pulse: number; perfusionIndex: number };
}
export type Reading = Blow | GlucoseReading | OximetryReading;

export interface MedicalDevice {
  name: string;
  serialNumber: string;
  baselineReadingDate: string; // YYYY-MM-DD
  baselineReadings: Reading[];
}

export interface PatientDoc {
  _id: string;
  dailyLogs: DailyLog[];
  medications: Medication[];
  reminders: unknown[];
  medicalDevices: MedicalDevice[]; // one home device per patient
  asthmaTreatmentPlan: { status: "Green" | "Yellow" | "Red"; expiration: string | null; retestTime: string | null } | null;
  earnedMedicationBadges: unknown[];
  earnedTrackerBadges: unknown[];
  /** Overview card ids in display order, as the clinician last left them; absent = the default cards. */
  overviewCards?: string[];
  /** Normal ranges the clinician changed for this patient, by chart field id; absent = the defaults (lib/clinician/ranges.js). */
  overviewRanges?: Record<string, { lo: number | null; hi: number | null }>;
}

export interface TrackerQuestion {
  id: string;
  type: "device" | "faceScale" | "checkbox" | "yesNo";
  text: string;
  options?: string[];
}

export interface TrackerDef { id: string; name: string; questions: TrackerQuestion[] }

// View state shared by the UI and lib/.
export type Metric = "fev1" | "fev1Fvc" | "pef";
export type ShowAs = "raw" | "predicted" | "best" | "baseline";
export type Period = 7 | 30 | 90;
export interface View { patient: number; period: Period; metric: Metric; showAs: ShowAs }

export interface PatientListItem { index: number; shortId: string; condition: string; zone: string | null }
