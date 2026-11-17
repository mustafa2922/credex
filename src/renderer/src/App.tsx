import { RouterProvider } from 'react-router'
import { router } from '@renderer/app/router'

export default function App(): React.JSX.Element {
  return <RouterProvider router={router} />
}
