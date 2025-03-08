import * as React from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';

interface TldrawBoardProps {
  darkMode: boolean;
  onMount: (app: any) => void;
}

export const TldrawBoard: React.FC<TldrawBoardProps> = ({ darkMode, onMount }) => {
  return (
    <Tldraw
      autoFocus={true}
      onMount={onMount}
    />
  );
};