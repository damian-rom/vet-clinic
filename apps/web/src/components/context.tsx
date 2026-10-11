'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { OwnerWorkspace, VetWorkspace } from '@vet-clinic/types';
export interface ClinicContext {
  data: OwnerWorkspace | VetWorkspace;
  busy: boolean;
  open: (title: string, description: string, content: ReactNode) => void;
  close: () => void;
  run: (task: () => Promise<unknown>, message: string, close?: boolean) => Promise<boolean>;
}
export const Context = createContext<ClinicContext | null>(null);
export function useClinic() {
  const value = useContext(Context);
  if (!value) throw new Error('Clinic context missing');
  return value;
}
export function useVet() {
  const ctx = useClinic();
  if (!('products' in ctx.data)) throw new Error('Veterinarian workspace required');
  return { ...ctx, data: ctx.data };
}
export function useOwner() {
  const ctx = useClinic();
  if ('products' in ctx.data) throw new Error('Owner workspace required');
  return { ...ctx, data: ctx.data };
}
