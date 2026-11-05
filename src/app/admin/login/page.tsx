import { brandView } from '@/server/brand'
import { LoginForm } from './LoginForm'

export default async function Login() {
  return <LoginForm brand={await brandView()} />
}
