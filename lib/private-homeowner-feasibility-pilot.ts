import type { PrivateAuthorization } from "./private-property-intelligence-runtime.ts";
import type { PrivateFeasibilityEnrichment, UserExistingUse } from "./private-feasibility-enrichment.ts";
import { SanDiegoPrivateFeasibilityRuntime } from "./san-diego-private-feasibility-runtime.ts";

export type ConfirmationAnswer = "YES" | "NO" | "NOT_SURE";
export type PilotProjectIntent = "DETACHED_ADU" | "ATTACHED_ADU" | "GARAGE_CONVERSION" | "JADU" | "MULTIPLE_ADUS" | "ADDITIONAL_UNIT" | "MULTIFAMILY_ADDITION" | "GENERAL";
export type AduWorkAnswer = "PRESENT" | "NOT_COMPLETED_OR_DIFFERS" | "NOT_STARTED" | "NOT_SURE";
export type EvidenceLevel = "HOMEOWNER_CONFIRMATION" | "PUBLIC_RECORD" | "CURRENT_PHOTO" | "PERMIT_DOCUMENT" | "SITE_PLAN" | "SURVEY" | "PLANS_OR_CITY_DETERMINATION";
export const PILOT_ANALYTICS_EVENTS = ["parcel_started","first_question_answered","not_sure_selected","correction_provided","preliminary_result_reached","evidence_requested","evidence_supplied","session_abandoned","result_revisited"] as const;
export const PILOT_OUTCOME_HOOKS = ["HOMEOWNER_CONFIGURATION_CONFIRMED","UPLOADED_EVIDENCE_RESOLVED_CONFLICT","PERMIT_STATUS_CHANGED","PROJECT_PROCEEDED","PROJECT_ABANDONED","CITY_DETERMINATION_OBTAINED"] as const;

export type HomeownerResultView = {
  headline: string;
  whatWeKnow: string[];
  whatYouToldUs: string[];
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
  if(confirmation!==null||existingUse!==null||aduWork!==null||accessory!==null)provenance.push("Your answer");
  const unknown:string[]=[];if(confirmation===null)unknown.push("How many dwelling units are on the property today still needs confirmation.");if(confirmation==="NOT_SURE")unknown.push("The current number and arrangement of dwelling units still needs confirmation.");if(conflict)unknown.push(conflict);
  const nextAction=evidence==="HOMEOWNER_CONFIRMATION"?"If you can, confirm how many dwelling units are on the property today.":evidence==="CURRENT_PHOTO"?"A current photo may be enough to resolve the recorded structure question.":evidence==="PERMIT_DOCUMENT"?"A current permit document or plan that identifies this property may resolve the open question.":"Review the recorded property information and tell TruLot if it no longer matches the property.";
  const known=[enrichment.summary];const told:string[]=[];if(confirmation==="YES")told.push("You confirmed that the recorded property description is still correct.");if(confirmation==="NO")told.push("You told TruLot that the recorded property description is not current.");if(confirmation==="NOT_SURE")told.push("You are not sure whether the recorded property description is current.");if(existingUse)told.push(`You described the current property as ${existingUse==="ONE_DETACHED_HOUSE"?"one main home":existingUse==="TWO_OR_MORE_DWELLINGS"?"having two or more dwelling units":existingUse==="CONDOMINIUM"?"a condominium property":existingUse==="VACANT_LAND"?"vacant land":"not yet confirmed"}.`);if(aduWork==="PRESENT")told.push("You said ADU-related work is present.");if(aduWork==="NOT_COMPLETED_OR_DIFFERS")told.push("You said the ADU-related work was not completed or differs from the record.");if(aduWork==="NOT_STARTED")told.push("You said the ADU-related work has not started.");if(accessory===false)told.push("You said the older mapped secondary structure is no longer present.");if(accessory===true)told.push("You said the older mapped secondary structure is still present.");
  let contradiction:string|null=null;if(enrichment.boundedAduEvidence==="FINALED"&&aduWork==="NOT_COMPLETED_OR_DIFFERS")contradiction="A finaled City permit record and the homeowner's description do not agree. A current photo and permit document would help resolve the difference.";if(enrichment.boundedAduEvidence==="ACTIVE"&&aduWork==="NOT_STARTED")contradiction="City records show active ADU-related work, while the homeowner reports that work has not started. The current permit document would clarify the status.";
  const guidance=confirmation===null?"TruLot needs your confirmation before choosing which property rules to review.":enrichment.preliminaryPathway==="SINGLE_FAMILY"?"Based on what we know so far, TruLot is reviewing the rules that apply to a property with one existing main home.":enrichment.preliminaryPathway==="MULTIFAMILY"?"Based on what we know so far, TruLot is reviewing the rules that apply to a property with multiple existing dwelling units.":"TruLot is keeping the review preliminary until the current property configuration is clearer.";
  return {headline:enrichment.resultState==="SOURCE_UNAVAILABLE"?"Preliminary review available with limited property records":"Preliminary feasibility review",whatWeKnow:known,whatYouToldUs:told,whatWeDoNotKnow:unknown,preliminaryGuidance:guidance,nextAction,whyItMatters:"The current configuration affects which existing-property rules and project questions are relevant.",evidenceProvenance:provenance,contradiction,aduLifecycle:aduLifecycleLanguage(enrichment.boundedAduEvidence)};
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
