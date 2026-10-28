// Shapes follow the `issues`, `issue_events`, `crop_checks` and `check_results` tables
// (architecture.md §5.3). Sample data fills them until the dashboard reads Supabase.

export type Severity = 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'in_review' | 'waiting_farmer' | 'action_given' | 'monitoring' | 'closed';
export type CheckState = 'possible_match' | 'needs_more_information' | 'expert_review_required' | 'unsupported_crop';
export type Likelihood = 'more_likely' | 'possible';
export type Crop = 'tomatoes' | 'maize' | 'beans' | 'kale' | 'potatoes' | 'cabbage';

/** Drawing used for a photo while there are no real photos (sample data only). */
export type Photo = 'early_blight' | 'late_blight' | 'septoria' | 'tuta' | 'chewed' | 'streak' | 'rust' | 'wilt' | 'healthy' | 'blurry';

/** How the farmer says the crop looks on a follow-up photo, compared with the first one. */
export type Outcome = 'better' | 'same' | 'worse';

export type Farmer = { name: string; phone: string; language: 'en' | 'sw'; county: string; ward: string };

export type EventKind =
  | 'created'
  | 'ai_suggestion'
  | 'review_agree'
  | 'review_adjust'
  | 'review_reject'
  | 'request_photos'
  | 'comment'
  | 'status_change'
  | 'follow_up_result';

export type IssueEvent = {
  id: string;
  kind: EventKind;
  actorKind: 'farmer' | 'agronomist' | 'system' | 'ai';
  actor: string;
  at: string;
  body?: string;
  causeIds?: string[];
  /** Set when an agronomist reply matched a product or dose pattern (architecture.md §6.4). */
  flagged?: boolean;
  status?: IssueStatus;
  photo?: Photo;
  /** Follow-up photos: the farmer's verdict and the photo's signed URL (connected mode). */
  outcome?: Outcome;
  photoUrl?: string;
};

export type Issue = {
  id: string;
  /** The farmer's user id (connected mode); sample data matches farmers by name. */
  farmerId?: string;
  code: string;
  title: string;
  farmer: Farmer;
  farm: string;
  plot: string;
  crop: Crop;
  symptoms: string[];
  photos: Photo[];
  /** Signed URLs of real photos (connected mode). Drawings in `photos` are used when empty. */
  photoUrls?: string[];
  severity: Severity;
  status: IssueStatus;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  followUpDue: string | null;
  ai: { state: CheckState; causes: { id: string; likelihood: Likelihood }[]; library: string } | null;
  events: IssueEvent[];
};
