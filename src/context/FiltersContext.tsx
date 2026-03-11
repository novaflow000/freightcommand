import React, { createContext, useContext, useState } from 'react';

export type Filters = {
  dateFrom?: string;
  dateTo?: string;
  carrier?: string;
  origin?: string;
  destination?: string;
  status?: string;
  container?: string;
  booking?: string;
};

interface FiltersContextValue {
  filters: Filters;
  setFilters: (next: Filters) => void;
}

const FiltersContext = createContext<FiltersContextValue | undefined>(undefined);

export const FiltersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<Filters>({});
  return (
    <FiltersContext.Provider value={{ filters, setFilters }}>
      {children}
    </FiltersContext.Provider>
  );
};

export const useFilters = () => {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used within FiltersProvider');
  return ctx;
};
