export type NonogramCell = 'empty' | 'filled' | 'marked';

export type NonogramGrid = NonogramCell[][];

export interface NonogramClues {
  readonly rows: number[][];
  readonly cols: number[][];
}
