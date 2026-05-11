import { parseCongressDate } from "./bill-dates";

export type ProgressStage =
  | "introduced"
  | "committee"
  | "passed_origin"
  | "passed_both"
  | "to_president"
  | "enacted";

export const PROGRESS_STAGES: ProgressStage[] = [
  "introduced",
  "committee",
  "passed_origin",
  "passed_both",
  "to_president",
  "enacted",
];

const PROGRESS_STAGE_RANK: Record<ProgressStage, number> = {
  introduced: 0,
  committee: 1,
  passed_origin: 2,
  passed_both: 3,
  to_president: 4,
  enacted: 5,
};

const PROGRESS_STAGE_SET: Set<string> = new Set(PROGRESS_STAGES);

export function toProgressStage(value: string | null | undefined): ProgressStage | null {
  if (value && PROGRESS_STAGE_SET.has(value)) {
    return value as ProgressStage;
  }
  return null;
}

export function getProgressStageRank(value: string | null | undefined): number {
  const stage = toProgressStage(value);
  return stage ? PROGRESS_STAGE_RANK[stage] : PROGRESS_STAGE_RANK.introduced;
}

export interface CongressSummary {
  versionCode: string;
  actionDate: string;
  actionDesc: string;
}

export interface CongressAction {
  actionDate: string;
  type: string | null;
  actionCode: string | null;
  text: string;
}

export interface ProgressInput {
  billType: string;
  originChamber: "House" | "Senate";
  laws: Array<{ number: string; type: string }>;
  summaries: CongressSummary[];
  actions: CongressAction[];
}

export interface ProgressResult {
  stage: ProgressStage;
  stageReachedAt: Date;
  latestActionText: string;
}

const COMMITTEE_REPORTED_VERSION_CODES = new Set(["07", "08", "09", "25", "26", "27"]);
const PASSED_HOUSE_VERSION = "53";
const PASSED_SENATE_VERSION = "55";
const PASSED_BOTH_RECONCILED_VERSIONS = new Set(["59", "60"]);
const PUBLIC_LAW_VERSION = "49";
const INTRODUCED_VERSION = "00";

const ENACTED_ACTION_CODES = new Set(["36000", "E40000"]);
const SIGNED_OR_PRESENTED_CODES = new Set(["28000", "E20000", "E30000"]);
const PASSED_HOUSE_ACTION_CODE = "8000";
const PASSED_SENATE_ACTION_CODE = "17000";
const COMMITTEE_REPORTED_ACTION_CODES = new Set(["1010", "H12100", "S12100"]);
const COMMITTEE_REFERRAL_PATTERN = /^(H1110|S0010)/;

const RESOLUTION_NO_PRESIDENT = new Set(["HRES", "SRES", "HCONRES", "SCONRES"]);
const RESOLUTION_SINGLE_CHAMBER = new Set(["HRES", "SRES"]);

interface Match {
  date: Date;
  text: string;
}

export function classifyBillProgress(input: ProgressInput): ProgressResult {
  const billType = input.billType.toUpperCase();
  const noPresident = RESOLUTION_NO_PRESIDENT.has(billType);
  const singleChamber = RESOLUTION_SINGLE_CHAMBER.has(billType);

  const enacted = !noPresident ? findEnacted(input) : null;
  if (enacted) {
    return {
      stage: "enacted",
      stageReachedAt: enacted.date,
      latestActionText: enacted.text,
    };
  }

  const toPresident = !noPresident ? findToPresident(input) : null;
  if (toPresident) {
    return {
      stage: "to_president",
      stageReachedAt: toPresident.date,
      latestActionText: toPresident.text,
    };
  }

  const passedBoth = !singleChamber ? findPassedBoth(input) : null;
  if (passedBoth) {
    return {
      stage: "passed_both",
      stageReachedAt: passedBoth.date,
      latestActionText: passedBoth.text,
    };
  }

  const passedOrigin = findPassedOrigin(input);
  if (passedOrigin) {
    return {
      stage: "passed_origin",
      stageReachedAt: passedOrigin.date,
      latestActionText: passedOrigin.text,
    };
  }

  const committee = findCommittee(input);
  if (committee) {
    return {
      stage: "committee",
      stageReachedAt: committee.date,
      latestActionText: committee.text,
    };
  }

  const introduced = findIntroduced(input);
  return {
    stage: "introduced",
    stageReachedAt: introduced.date,
    latestActionText: introduced.text,
  };
}

function findEnacted(input: ProgressInput): Match | null {
  if (input.laws.length > 0) {
    const lawAction = input.actions.find(
      (a) =>
        (a.actionCode && ENACTED_ACTION_CODES.has(a.actionCode)) ||
        a.type === "BecameLaw" ||
        /became (public|private) law/i.test(a.text)
    );
    if (lawAction) {
      return { date: parseCongressDate(lawAction.actionDate), text: lawAction.text };
    }
    const summary = input.summaries.find((s) => s.versionCode === PUBLIC_LAW_VERSION);
    if (summary) {
      return {
        date: parseCongressDate(summary.actionDate),
        text: summary.actionDesc || "Became Public Law",
      };
    }
  }

  const action = input.actions.find(
    (a) =>
      (a.actionCode && ENACTED_ACTION_CODES.has(a.actionCode)) ||
      a.type === "BecameLaw" ||
      /became (public|private) law/i.test(a.text)
  );
  if (action) {
    return { date: parseCongressDate(action.actionDate), text: action.text };
  }
  const summary = input.summaries.find((s) => s.versionCode === PUBLIC_LAW_VERSION);
  if (summary) {
    return {
      date: parseCongressDate(summary.actionDate),
      text: summary.actionDesc || "Became Public Law",
    };
  }
  return null;
}

function findToPresident(input: ProgressInput): Match | null {
  const action = input.actions.find(
    (a) =>
      (a.actionCode && SIGNED_OR_PRESENTED_CODES.has(a.actionCode)) ||
      a.type === "President" ||
      /presented to president|signed by president|vetoed by president|pocket vetoed/i.test(a.text)
  );
  if (!action) return null;
  return { date: parseCongressDate(action.actionDate), text: action.text };
}

function findPassedBoth(input: ProgressInput): Match | null {
  const reconciled = input.summaries.find((s) =>
    PASSED_BOTH_RECONCILED_VERSIONS.has(s.versionCode)
  );
  if (reconciled) {
    return {
      date: parseCongressDate(reconciled.actionDate),
      text: reconciled.actionDesc,
    };
  }
  const passedHouse = input.summaries.find((s) => s.versionCode === PASSED_HOUSE_VERSION);
  const passedSenate = input.summaries.find((s) => s.versionCode === PASSED_SENATE_VERSION);
  if (passedHouse && passedSenate) {
    const later =
      parseCongressDate(passedHouse.actionDate).getTime() >=
      parseCongressDate(passedSenate.actionDate).getTime()
        ? passedHouse
        : passedSenate;
    return { date: parseCongressDate(later.actionDate), text: later.actionDesc };
  }

  const housePassAction = input.actions.find(
    (a) =>
      a.actionCode === PASSED_HOUSE_ACTION_CODE ||
      /passed\/agreed to in house/i.test(a.text)
  );
  const senatePassAction = input.actions.find(
    (a) =>
      a.actionCode === PASSED_SENATE_ACTION_CODE ||
      /passed\/agreed to in senate/i.test(a.text)
  );
  if (housePassAction && senatePassAction) {
    const later =
      parseCongressDate(housePassAction.actionDate).getTime() >=
      parseCongressDate(senatePassAction.actionDate).getTime()
        ? housePassAction
        : senatePassAction;
    return { date: parseCongressDate(later.actionDate), text: later.text };
  }

  return null;
}

function findPassedOrigin(input: ProgressInput): Match | null {
  const isHouse = input.originChamber === "House";
  const versionCode = isHouse ? PASSED_HOUSE_VERSION : PASSED_SENATE_VERSION;
  const summary = input.summaries.find((s) => s.versionCode === versionCode);
  if (summary) {
    return { date: parseCongressDate(summary.actionDate), text: summary.actionDesc };
  }

  const actionCode = isHouse ? PASSED_HOUSE_ACTION_CODE : PASSED_SENATE_ACTION_CODE;
  const textPattern = isHouse ? /passed\/agreed to in house/i : /passed\/agreed to in senate/i;
  const action = input.actions.find(
    (a) => a.actionCode === actionCode || textPattern.test(a.text)
  );
  if (action) {
    return { date: parseCongressDate(action.actionDate), text: action.text };
  }
  return null;
}

function findCommittee(input: ProgressInput): Match | null {
  const reportedSummary = input.summaries.find((s) =>
    COMMITTEE_REPORTED_VERSION_CODES.has(s.versionCode)
  );
  if (reportedSummary) {
    return {
      date: parseCongressDate(reportedSummary.actionDate),
      text: reportedSummary.actionDesc,
    };
  }

  const reportedAction = input.actions.find(
    (a) =>
      (a.actionCode && COMMITTEE_REPORTED_ACTION_CODES.has(a.actionCode)) ||
      (a.type === "Committee" && /reported/i.test(a.text))
  );
  if (reportedAction) {
    return { date: parseCongressDate(reportedAction.actionDate), text: reportedAction.text };
  }

  const referralAction = input.actions.find(
    (a) =>
      (a.actionCode && COMMITTEE_REFERRAL_PATTERN.test(a.actionCode)) ||
      (a.type === "IntroReferral" && /referred to/i.test(a.text)) ||
      /^referred to/i.test(a.text)
  );
  if (referralAction) {
    return { date: parseCongressDate(referralAction.actionDate), text: referralAction.text };
  }

  return null;
}

function findIntroduced(input: ProgressInput): Match {
  const summary = input.summaries.find((s) => s.versionCode === INTRODUCED_VERSION);
  if (summary) {
    return { date: parseCongressDate(summary.actionDate), text: summary.actionDesc };
  }
  const action = input.actions.find(
    (a) => a.type === "IntroReferral" && /^introduced in/i.test(a.text)
  );
  if (action) {
    return { date: parseCongressDate(action.actionDate), text: action.text };
  }

  const earliest = [...input.actions].sort((a, b) =>
    a.actionDate.localeCompare(b.actionDate)
  )[0];
  if (earliest) {
    return { date: parseCongressDate(earliest.actionDate), text: earliest.text };
  }
  return { date: new Date(), text: "Introduced" };
}

const STAGE_LABELS: Record<ProgressStage, string> = {
  introduced: "Introduced",
  committee: "In Committee",
  passed_origin: "Passed Chamber",
  passed_both: "Passed Both Chambers",
  to_president: "To President",
  enacted: "Enacted",
};

export function getStageLabel(stage: ProgressStage, billType?: string): string {
  if (!billType) return STAGE_LABELS[stage];
  const t = billType.toUpperCase();
  if (RESOLUTION_SINGLE_CHAMBER.has(t) && stage === "passed_origin") {
    return "Adopted";
  }
  if (RESOLUTION_NO_PRESIDENT.has(t) && stage === "passed_both") {
    return "Agreed to in Both Chambers";
  }
  return STAGE_LABELS[stage];
}
