// Minimal, dependency-free stopword filtering for Dutch text.
// Exports: filterMeaningfulWords, countMeaningfulWords, DUTCH_STOPWORDS

function tokenize(text: string): string[] {
    if (!text) return [];
    const normalized = text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");
    // woorden (inclusief apostrof-varianten zoals 't, d'r, m'n)
    const tokens = normalized.match(/\p{L}+(?:'\p{L}+)?/gu);
    return tokens ?? [];
  }
  
  export const DUTCH_STOPWORDS = new Set<string>([
    // Lidwoorden / determiners
    "de","het","een","dit","dat","deze","die","elk","elke","ieder","iedere","zelfde","zulk","zulke","dergelijke",
    // Voornaamwoorden
    "ik","jij","je","jou","jouw","u","uw","hij","hem","zijn","zij","ze","haar","we","wij","ons","onze","jullie","hun","hen","men","me","mij","mijn",
    // Korte gecontracteerde vormen
    "'t","'m","'n","d'r","m'n","z'n",
    // Bijwoorden / plaats / tijd
    "hier","daar","er","waar","wanneer","hoe","waarom","hierin","hierop","hiermee","daarin","daarop","daarmee","erop","erin",
    // Werkwoordsvormen (hulpwerkwoorden)
    "ben","bent","is","zijn","was","waren","wees","geweest","word","wordt","worden","werd","werden","zullen","zal","zult","zou","zouden",
    "heb","hebt","heeft","hebben","had","hadden","gehad","doe","doet","doen","deed","deden","gedaan",
    // Ontkenning
    "niet","geen","niets","niks",
    // Voegwoorden / voorzetsels
    "en","of","maar","want","dus","toch","als","dan","omdat","zodat","hoewel","terwijl","voordat","nadat","sinds",
    "in","op","aan","van","voor","achter","naast","onder","boven","over","door","naar","uit","met","bij","tegen","zonder","tijdens","tot","tussen","volgens","per",
    // Kwantoren / graad
    "alle","allen","alles","ieder","iedereen","sommige","sommigen","enkele","enkel","veel","weinig","meer","minder","meeste","meestal","kort","lang",
    // Tijd / frequentie / discourse
    "nu","toen","straks","later","reeds","al","alweer","altijd","nooit","vaak","soms","zelden","binnenkort","vandaag","morgen","gisteren",
    "ook","weer","wel","eens","eerst","dan","toen","nog","alweer","hierbij","daarbij","namelijk","etc","via",
    // Voornaamwoordelijke bijwoorden / aanwijzend
    "deze","die","dit","dat","dits","diegene","degene"
  ]);
  
  export function filterMeaningfulWords(text: string): string[] {
    const tokens = tokenize(text);
    return tokens.filter(t => !DUTCH_STOPWORDS.has(t));
  }
  
  export function countMeaningfulWords(text: string): number {
    return filterMeaningfulWords(text).length;
  }
  