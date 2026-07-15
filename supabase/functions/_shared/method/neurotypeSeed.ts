// Seed neurotipo per la forma B - Strato 3 (feed-forward, SOVRASCRITTO dal dato misurato).
// Derivato dai 'cues' di app/neurotipo-scoring.json (Thibaudeau, spunti editabili di Nicolo).
// NON e una prescrizione: inclina i default (volume/frequenza/recupero/metodo), il dato comanda.

export type NeurotypeCode = "1A" | "1B" | "2A" | "2B" | "3";

export interface NeurotypeSeed {
  type: NeurotypeCode | null;
  label: string;
  frequencyBias: "molto alta" | "alta" | "media" | "bassa";
  volumeBias: "bassissimo" | "basso" | "medio" | "alto" | "molto alto";
  intensityBias: "molto alta" | "alta" | "media" | "medio-bassa";
  restBias: "lungo" | "medio" | "corto";
  methodPref: string[];
  avoid: string[];
  varietyTolerance: "alta" | "media" | "bassa";
  note: string;
}

// Regola di lettura: lo stress sposta il profilo verso destra (2B/3) -> gestione, non diagnosi.
export const NEUROTYPE_SEED: Record<NeurotypeCode, NeurotypeSeed> = {
  "1A": {
    type: "1A",
    label: "Competitivo - intensita e leadership",
    frequencyBias: "molto alta",
    volumeBias: "bassissimo",
    intensityBias: "molto alta",
    restBias: "lungo",
    methodPref: ["forza massimale", "grind pesante", "alzate principali"],
    avoid: ["pump-only", "alto volume di isolamento"],
    varietyTolerance: "bassa",
    note: "Carichi pesanti, poche alzate (~2-4), sedute brevi, frequenza 6-7. Comunicazione diretta, numeri e obiettivi.",
  },
  "1B": {
    type: "1B",
    label: "Esplosivo - impaziente, cerca novita",
    frequencyBias: "alta",
    volumeBias: "medio",
    intensityBias: "alta",
    restBias: "medio",
    methodPref: ["balistico/esplosivo", "stretch-reflex", "olimpica/derivate", "varieta di task"],
    avoid: ["monotonia", "molto lento"],
    varietyTolerance: "alta",
    note: "Carichi medio-alti mossi esplosivi, molti task, frequenza 5-6, recuperi a coppie (pairings).",
  },
  "2A": {
    type: "2A",
    label: "Empatico - adattabile",
    frequencyBias: "alta",
    volumeBias: "alto",
    intensityBias: "media",
    restBias: "corto",
    methodPref: ["mix neurale+muscolare a seduta", "varieta"],
    avoid: ["ripetitivo mentale"],
    varietyTolerance: "alta",
    note: "Mix neurale+muscolare ogni seduta (volume piu alto se misto), recuperi corti. Sotto stress abbassa la frequenza (3-4).",
  },
  "2B": {
    type: "2B",
    label: "Emotivo - abitudinario, cerca connessione",
    frequencyBias: "media",
    volumeBias: "molto alto",
    intensityBias: "media",
    restBias: "corto",
    methodPref: ["bodybuilding", "tempo lento e hold", "tolleranza al lattato"],
    avoid: ["esplosivo", "molto pesante", "olimpica"],
    varietyTolerance: "media",
    note: "Volume muscolare alto, tempo lento, mind-muscle, recuperi corti sul muscolare.",
  },
  "3": {
    type: "3",
    label: "Analitico - ansioso, pianificatore",
    frequencyBias: "media",
    volumeBias: "medio",
    intensityBias: "media",
    restBias: "lungo",
    methodPref: [
      "gesto padroneggiato e ripetitivo",
      "progressione graduale",
      "tante serie stesso esercizio",
    ],
    avoid: ["varieta eccessiva", "novita improvvisa"],
    varietyTolerance: "bassa",
    note: "Programmi statici che cambiano molto gradualmente, recuperi lunghi ma attivi. La varieta e uno stress.",
  },
};

// Seed neutro quando il neurotipo non e disponibile (profiles.neurotype NULL): i default vengono dall'obiettivo.
export const NEUTRAL_SEED: NeurotypeSeed = {
  type: null,
  label: "Neurotipo non disponibile",
  frequencyBias: "media",
  volumeBias: "medio",
  intensityBias: "media",
  restBias: "medio",
  methodPref: [],
  avoid: [],
  varietyTolerance: "media",
  note: "Nessun neurotipo: usa i default dell'obiettivo; il seed non inclina nulla.",
};

/** Ritorna il seed per il tipo; NEUTRAL_SEED se null/ignoto. Non lancia. */
export function neurotypeSeed(type: string | null | undefined): NeurotypeSeed {
  if (type && type in NEUROTYPE_SEED) return NEUROTYPE_SEED[type as NeurotypeCode];
  return NEUTRAL_SEED;
}
