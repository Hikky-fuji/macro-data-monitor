export const metadata = {
  title: { absolute: 'US Housing Cycle Monitor | Macro Data Monitor' },
  description: 'US housing starts, permits, new-home sales, inventory, mortgage rates and house prices from official sources.',
  alternates: { canonical: '/us/housing' },
  openGraph: { title: 'US Housing Cycle Monitor | Macro Data Monitor', description: 'Construction, demand, financing and house-price momentum.', url: '/us/housing', images: [{ url: '/us/housing/opengraph-image', width: 1200, height: 630 }] },
}

export default function UsHousingLayout({ children }) { return children }
