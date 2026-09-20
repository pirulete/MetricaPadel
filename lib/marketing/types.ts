/**
 * Tipos compartidos del dominio de marketing (v0.1)
 * Usados por cache.ts, header/footer públicos y API pública.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface NavigationData {
  siteName: string;
  logo: string;
  navLinks: NavLink[];
  footerLinks: NavLink[];
}

export const DEFAULT_NAVIGATION: NavigationData = {
  siteName: "",
  logo: "",
  navLinks: [],
  footerLinks: [],
};
