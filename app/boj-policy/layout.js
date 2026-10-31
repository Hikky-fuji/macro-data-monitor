export const metadata = {
  title: {
    absolute: 'BOJ Policy Monitor | Macro Data Monitor',
  },
  description:
    'A live BOJ policy transmission dashboard connecting underlying inflation, the output gap, labor tightness, wages and upstream prices.',
  alternates: {
    canonical: '/boj-policy',
  },
  openGraph: {
    title: 'BOJ Policy Monitor | Macro Data Monitor',
    description: 'Follow the wage-demand-inflation transmission chain with current official Bank of Japan data.',
    url: '/boj-policy',
  },
}

export default function BojPolicyLayout({ children }) {
  return children
}
