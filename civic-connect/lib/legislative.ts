export type ChamberFocus = "house" | "senate" | "both";

export function getBillChamberFocus(
  status: string,
  billType?: string | null
): ChamberFocus {
  const lower = status.toLowerCase();
  const normalizedType = (billType || "").toLowerCase();

  if (
    lower.includes("became law") ||
    lower.includes("signed by president") ||
    lower.includes("vetoed") ||
    lower.includes("presented to president")
  ) {
    return "both";
  }

  if (
    lower.includes("received in the senate") ||
    lower.includes("senate committee") ||
    lower.includes("passed senate") ||
    lower.includes("placed on senate")
  ) {
    return "senate";
  }

  if (
    lower.includes("received in the house") ||
    lower.includes("house committee") ||
    lower.includes("passed house") ||
    lower.includes("placed on house")
  ) {
    return "house";
  }

  if (normalizedType.startsWith("s")) {
    return "senate";
  }

  if (normalizedType.startsWith("h")) {
    return "house";
  }

  return "both";
}

export function getChamberLabel(chamber: ChamberFocus) {
  if (chamber === "house") {
    return "House";
  }

  if (chamber === "senate") {
    return "Senate";
  }

  return "Congress";
}

export function getRepresentativeLabel(chamber: ChamberFocus) {
  if (chamber === "house") {
    return "representatives";
  }

  if (chamber === "senate") {
    return "senators";
  }

  return "members";
}
