import { createHashRouter, type RouteObject } from 'react-router'
import type { ScreenHandle } from '@renderer/app/screen-handle'
import { screens, type AppScreen } from '@renderer/app/screens'
import { AppShell } from '@renderer/components/layout/AppShell'
import { ScreenFallback } from '@renderer/components/layout/ScreenFallback'
import { NotFoundPage } from '@renderer/pages/not-found/NotFoundPage'
import { RouteError } from '@renderer/pages/route-error/RouteError'

function toRoute(screen: AppScreen): RouteObject {
  const handle: ScreenHandle = {
    title: screen.label,
    description: screen.description
  }
  const route: RouteObject = {
    id: screen.id,
    handle,
    ...(screen.index ? { index: true } : { path: screen.path })
  }

  if (screen.Component) {
    route.Component = screen.Component
    return route
  }

  route.lazy = screen.load
  route.HydrateFallback = ScreenFallback
  return route
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          ...screens.map(toRoute),
          {
            path: '*',
            handle: { title: 'Not found' } satisfies ScreenHandle,
            Component: NotFoundPage
          }
        ]
      }
    ]
  }
])
