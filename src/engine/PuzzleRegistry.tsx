import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { PuzzleTypeId } from '@/types';
import type { PuzzleDefinition } from '@/engine/puzzleTypes';

interface PuzzleRegistryContextValue {
  readonly definitions: ReadonlyMap<PuzzleTypeId, PuzzleDefinition>;
  readonly getDefinition: (typeId: PuzzleTypeId) => PuzzleDefinition | undefined;
  readonly allTypeIds: readonly PuzzleTypeId[];
}

const PuzzleRegistryContext = createContext<PuzzleRegistryContextValue | null>(null);

export interface PuzzleRegistryProviderProps {
  readonly children: ReactNode;
  readonly definitions: readonly PuzzleDefinition[];
}

export const PuzzleRegistryProvider = ({
  children,
  definitions,
}: PuzzleRegistryProviderProps) => {
  const value = useMemo<PuzzleRegistryContextValue>(() => {
    const map = new Map<PuzzleTypeId, PuzzleDefinition>();
    for (const def of definitions) {
      map.set(def.typeId, def);
    }
    const allTypeIds = definitions.map((d) => d.typeId);
    return {
      definitions: map,
      getDefinition: (typeId: PuzzleTypeId) => map.get(typeId),
      allTypeIds,
    };
  }, [definitions]);

  return (
    <PuzzleRegistryContext.Provider value={value}>
      {children}
    </PuzzleRegistryContext.Provider>
  );
};

export const usePuzzleRegistry = (): PuzzleRegistryContextValue => {
  const ctx = useContext(PuzzleRegistryContext);
  if (ctx === null) {
    throw new Error('usePuzzleRegistry must be used within PuzzleRegistryProvider');
  }
  return ctx;
};
