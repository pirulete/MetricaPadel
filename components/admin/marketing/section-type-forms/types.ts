"use client";

/**
 * Tipos compartidos por los forms de block types del admin.
 */
import type { ComponentType } from "react";

export type BlockFormProps = {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

export type BlockFormComponent = ComponentType<BlockFormProps>;
