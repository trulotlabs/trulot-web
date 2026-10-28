import type { PrivateAuthorization } from "./private-property-intelligence-runtime.ts";
import type { PrivateFeasibilityEnrichment, UserExistingUse } from "./private-feasibility-enrichment.ts";
import { SanDiegoPrivateFeasibilityRuntime } from "./san-diego-private-feasibility-runtime.ts";

export type ConfirmationAnswer = "YES" | "NO" | "NOT_SURE";
export type PilotProjectIntent = "DETACHED_ADU" | "ATTACHED_ADU" | "GARAGE_CONVERSION" | "JADU" | "ADDITIONAL_UNIT" | "MULTIFAMILY_ADDITION" | "GENERAL";
export type AduWorkAnswer = "PRESENT" | "NOT_COMPLETED_OR_DIFFERS" | "NOT_STARTED" | "NOT_SURE";
export type EvidenceLevel = "HOMEOWNER_CONFIRMATION" | "PUBLIC_RECORD" | "CURRENT_PHOTO" | "PERMIT_DOCUMENT" | "SITE_PLAN" | "SURVEY" | "PLANS_OR_CITY_DETERMINATION";
export const PILOT_ANALYTICS_EVENTS = ["parcel_started","first_question_answered","not_sure_selected","correction_provided","preliminary_result_reached","evidence_requested","evidence_supplied","session_abandoned","result_revisited"] as const;
export const PILOT_OUTCOME_HOOKS = ["HOMEOWNER_CONFIGURATION_CONFIRMED","UPLOADED_EVIDENCE_RESOLVED_CONFLICT","PERMIT_STATUS_CHANGED","PROJECT_PROCEEDED","PROJECT_ABANDONED","CITY_DETERMINATION_OBTAINED"] as const;

export type HomeownerResultView = {
  headline: string;
  whatWeKnow: string[];
  whatWeDoNotKnow: string[];
  preliminaryGuidance: string;
  nextAction: string;
  whyItMatters: string;
  evidenceProvenance: string[];
  contradiction: string | null;
  aduLifecycle: string | null;
};

export type PilotSession = {
  sessionId: string; organizationId: string; apn: string;
  confirmation: ConfirmationAnswer | null; existingUse: UserExistingUse | null; projectIntent: PilotProjectIntent | null;
  accessoryStillPresent: boolean | null; aduWorkAnswer: AduWorkAnswer | null; enrichment: PrivateFeasibilityEnrichment;
  visibleQuestions: string[]; evidenceLevel: EvidenceLevel; result: HomeownerResultView;
  analytics: (typeof PILOT_ANALYTICS_EVENTS)[number][];
};

export function aduLifecycleLanguage(state: PrivateFeasibilityEnrichment["boundedAduEvidence"] | "ISSUED"): string | null {
  if(state==="FINALED")return "A later permit record indicates completed/finaled ADU work. Confirm the current property configuration before relying on layout assumptions.";
  if(state==="ACTIVE")return "City records show active ADU-related work. Completion and current occupancy are not established.";
  if(state==="ISSUED")return "A permit was issued, but completion is not established.";
  if(state==="EXPIRED_OR_WITHDRAWN")return "A prior ADU proposal appears expired/cancelled; that does not establish an existing ADU.";
  if(state==="UNKNOWN")return "An ADU-related record exists, but its completion status is not clear.";
  return null;
}

function conflictLanguage(conflicts:string[]):string|null{
  if(!conflicts.length)return null;
  if(conflicts.includes("COMMON_ADDRESS_PERMIT_AMBIGUITY"))return "A permit record is associated with a shared address and cannot yet be tied to this property unit. An APN-specific permit document would resolve it.";
  if(conflicts.includes("COMMON_PARCEL_GEOMETRY_AMBIGUITY"))return "Older building mapping and the recorded parcel configuration do not align clearly. A current photo may resolve the immediate question; a site plan is needed only if placement matters to the project.";
  return "Recorded property information and later evidence disagree about the current configuration. Homeowner confirmation or a current permit document would help resolve it.";
}

function lowestEvidence(enrichment:PrivateFeasibilityEnrichment,confirmation:ConfirmationAnswer|null):EvidenceLevel{
  if(confirmation===null)return "HOMEOWNER_CONFIRMATION";
  if(confirmation==="NOT_SURE")return enrichment.boundedAduEvidence==="ACTIVE"||enrichment.boundedAduEvidence==="UNKNOWN"?"PERMIT_DOCUMENT":"CURRENT_PHOTO";
  if(enrichment.recordedFacts.conflictTypes.includes("COMMON_ADDRESS_PERMIT_AMBIGUITY"))return "PERMIT_DOCUMENT";
  if(enrichment.recordedFacts.conflictTypes.includes("COMMON_PARCEL_GEOMETRY_AMBIGUITY"))return "CURRENT_PHOTO";
  return "PUBLIC_RECORD";
}

function presentation(enrichment:PrivateFeasibilityEnrichment,confirmation:ConfirmationAnswer|null,existingUse:UserExistingUse|null,aduWork:AduWorkAnswer|null,accessory:boolean|null):HomeownerResultView{
  const conflict=conflictLanguage(enrichment.recordedFacts.conflictTypes);const evidence=lowestEvidence(enrichment,confirmation);
  const provenance=["Recorded property record"];
  if(enrichment.boundedAduEvidence!=="NONE"||enrichment.currentnessState.includes("CHANGE"))provenance.push("City permit record");
  if(enrichment.recordedFacts.conflictTypes.some(x=>x.includes("GEOMETRY")))provenance.push("Older building mapping");
  if(confirmation!==null||existingUse!==null||aduWork!==null||accessory!==null)provenance.push("Homeowner-provided answer");
  const unknown:string[]=[];if(confirmation===null)unknown.push("The current dwelling configuration has not been confirmed.");if(confirmation==="NOT_SURE")unknown.push("The homeowner is not sure of the current configuration.");if(conflict)unknown.push("A source disagreement remains unresolved.");
  const nextAction=evidence==="HOMEOWNER_CONFIRMATION"?"Confirm what is currently on the property.":evidence==="CURRENT_PHOTO"?"Provide a current photo showing the relevant structure.":evidence==="PERMIT_DOCUMENT"?"Provide the current permit document or plans that identify this property.":"Review the recorded property information and correct it if it no longer matches the property.";
  const known=[enrichment.summary];if(aduWork==="PRESENT")known.push("The homeowner reports that ADU-related work is present; this remains a user-provided statement.");if(aduWork==="NOT_COMPLETED_OR_DIFFERS")known.push("The homeowner reports that the work was not completed or differs from the record.");if(aduWork==="NOT_STARTED")known.push("The homeowner reports that work has not started.");if(accessory===false)known.push("The homeowner reports that the older mapped secondary structure is no longer present.");
  let contradiction=conflict;if(enrichment.boundedAduEvidence==="FINALED"&&aduWork==="NOT_COMPLETED_OR_DIFFERS")contradiction="A finaled City permit record and the homeowner's description do not agree. A current photo and permit document would help resolve the difference.";if(enrichment.boundedAduEvidence==="ACTIVE"&&aduWork==="NOT_STARTED")contradiction="City records show active ADU-related work, while the homeowner reports that work has not started. The current permit document would clarify the status.";
  return {headline:enrichment.resultState==="SOURCE_UNAVAILABLE"?"Preliminary review available with limited property records":"Preliminary feasibility review",whatWeKnow:known,whatWeDoNotKnow:unknown,preliminaryGuidance:enrichment.preliminaryPathway?`The ${enrichment.preliminaryPathway==="SINGLE_FAMILY"?"single-family":"multifamily"} pathway appears consistent with preliminary review, conditional on the current property configuration.`:"No dwelling pathway is selected until the current configuration is confirmed.",nextAction,whyItMatters:"The current configuration affects which existing-structure assumptions and project questions are relevant.",evidenceProvenance:provenance,contradiction,aduLifecycle:aduLifecycleLanguage(enrichment.boundedAduEvidence)};
}

function visibleQuestions(enrichment:PrivateFeasibilityEnrichment,confirmation:ConfirmationAnswer|null,existingUse:UserExistingUse|null,intent:PilotProjectIntent|null,accessory:boolean|null,aduWork:AduWorkAnswer|null):string[]{
  const out:string[]=[];if(confirmation===null)out.push(enrichment.questions[0]?.prompt??"What is currently on the property?");
  if(confirmation==="NO"&&existingUse===null)out.push("What is currently on the property: one house, multiple dwellings, a condominium, vacant land, or something else?");
  if(intent===null)out.push("What project are you considering?");
  if(enrichment.boundedAduEvidence!=="NONE"&&aduWork===null)out.push("What is the current status of the ADU-related work?");
  if(enrichment.questions.some(x=>x.kind==="ACCESSORY_CONTEXT")&&accessory===null)out.push("Older mapping shows a detached secondary structure. Is that structure still there?");
  return [...new Set(out)];
}

export class PrivateHomeownerFeasibilityPilot {
  private runtime:SanDiegoPrivateFeasibilityRuntime;private sessions=new Map<string,PilotSession>();
  constructor(runtime:SanDiegoPrivateFeasibilityRuntime){this.runtime=runtime;}
  private key(auth:PrivateAuthorization,sessionId:string){return `${auth.ownerOrgId}:${sessionId}`;}
  async start(sessionId:string,apn:string,auth:PrivateAuthorization,previousV4:PrivateFeasibilityEnrichment):Promise<PilotSession>{
    const key=this.key(auth,sessionId);const prior=this.sessions.get(key);if(prior){prior.analytics.push("result_revisited");return structuredClone(prior);}
    const enrichment=await this.runtime.evaluate(apn,auth,previousV4);const session:PilotSession={sessionId,organizationId:auth.ownerOrgId,apn,confirmation:null,existingUse:null,projectIntent:null,accessoryStillPresent:null,aduWorkAnswer:null,enrichment,visibleQuestions:[],evidenceLevel:"HOMEOWNER_CONFIRMATION",result:presentation(enrichment,null,null,null,null),analytics:["parcel_started"]};session.visibleQuestions=visibleQuestions(enrichment,null,null,null,null,null);this.sessions.set(key,session);return structuredClone(session);
  }
  async answer(sessionId:string,auth:PrivateAuthorization,input:{confirmation?:ConfirmationAnswer;existingUse?:UserExistingUse;projectIntent?:PilotProjectIntent;accessoryStillPresent?:boolean;aduWorkAnswer?:AduWorkAnswer}):Promise<PilotSession>{
    const key=this.key(auth,sessionId);const session=this.sessions.get(key);if(!session)throw new Error("private pilot session not found");
    if(input.confirmation){session.confirmation=input.confirmation;session.analytics.push("first_question_answered");if(input.confirmation==="NOT_SURE")session.analytics.push("not_sure_selected");}
    if(input.existingUse){session.existingUse=input.existingUse;session.analytics.push("correction_provided");}
    if(input.projectIntent)session.projectIntent=input.projectIntent;if(input.accessoryStillPresent!==undefined)session.accessoryStillPresent=input.accessoryStillPresent;if(input.aduWorkAnswer)session.aduWorkAnswer=input.aduWorkAnswer;
    session.enrichment=await this.runtime.evaluate(session.apn,auth,session.enrichment,{userExistingUse:session.existingUse??undefined});session.evidenceLevel=lowestEvidence(session.enrichment,session.confirmation);session.visibleQuestions=visibleQuestions(session.enrichment,session.confirmation,session.existingUse,session.projectIntent,session.accessoryStillPresent,session.aduWorkAnswer);session.result=presentation(session.enrichment,session.confirmation,session.existingUse,session.aduWorkAnswer,session.accessoryStillPresent);session.analytics.push("preliminary_result_reached");if(session.evidenceLevel!=="PUBLIC_RECORD")session.analytics.push("evidence_requested");this.sessions.set(key,session);return structuredClone(session);
  }
}
