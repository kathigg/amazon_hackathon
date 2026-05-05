import { getBillImageRecord } from "@/lib/bill-image-categories";

export function getTopicImagePath(
  billId: string,
  topicTags: readonly string[]
) {
  return getBillImageRecord(billId, topicTags).imageUrl;
}
