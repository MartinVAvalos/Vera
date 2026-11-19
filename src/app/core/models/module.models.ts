export type ModuleType = 'Bible' | 'Commentary' | 'DailyDevotional' | 'GenBook' | 'Lexicon';

export interface Module {
  id: string;
  name: string;
  module_type: ModuleType;
  lang: string;
  description: string;
  installed: boolean;
}
