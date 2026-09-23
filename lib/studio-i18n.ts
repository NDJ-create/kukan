import { studioTranslations } from "./i18n";

export type StudioLanguage = "fr" | "en";

export type StudioMessageKey = keyof typeof studioTranslations.fr;

export type StudioParameters = Readonly<
  Record<string, string | number>
>;

export type StudioTranslator = (
  key: StudioMessageKey,
  parameters?: StudioParameters,
) => string;

type StudioDictionary = Record<StudioMessageKey, string>;

// Vérifie également que les deux dictionnaires ont les mêmes clés.
const dictionaries: Record<StudioLanguage, StudioDictionary> = {
  fr: studioTranslations.fr,
  en: studioTranslations.en,
};

export function createStudioTranslator(
  language: StudioLanguage,
): StudioTranslator {
  const dictionary = dictionaries[language];

  return (key, parameters = {}) =>
    dictionary[key].replace(
      /\{(\w+)\}/g,
      (placeholder: string, name: string) => {
        const value = parameters[name];
        return value === undefined ? placeholder : String(value);
      },
    );
}

/**
 * Erreur destinée à l'utilisateur.
 * Les autres exceptions restent des diagnostics techniques.
 */
export class StudioUiError extends Error {
  constructor(
    public readonly key: StudioMessageKey,
    public readonly parameters?: StudioParameters,
  ) {
    super(key);
    this.name = "StudioUiError";
  }
}
