import type {
  InterviewSectionId,
  SectionCoachResponse,
} from "./schema";
import { sectionTitle } from "./structured";

export function getMockSectionResponse(
  activeSection: InterviewSectionId,
): SectionCoachResponse {
  return {
    acknowledgement: `${sectionTitle(activeSection)} saved.`,
    assistantMessage: `${sectionTitle(activeSection)} is complete. Your selections are preserved exactly for the signal calibration summary.`,
    requiresClarification: false,
    clarificationQuestion: null,
    unresolvedIssue: null,
  };
}
