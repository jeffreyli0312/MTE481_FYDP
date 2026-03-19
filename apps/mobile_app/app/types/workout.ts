export interface Exercise {
  id: string;
  name: string;
  icon?: string;
}

export type SetRecord = {
  id: string;
  durationSec: number;
  avgForceN: number;
  sampleCount: number;
  repCount: number;
};

export type SessionRecord = {
  id: string;
  dateISO: string;
  durationSec: number;
  setsCount: number;
  avgForceN: number;
};
