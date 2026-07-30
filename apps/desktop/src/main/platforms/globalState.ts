import { StrategyServiceStatusEnum } from '../backend/types';

class GlobalVariable {
  contextCount: number = 20;

  status: StrategyServiceStatusEnum = StrategyServiceStatusEnum.STOPPED;

  truncateWordKey: string = '';

  truncateWordCount: number = 210;
}

const G_V = new GlobalVariable();

export default G_V;
