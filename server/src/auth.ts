import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { ServerConfig } from './types.js'

interface AdminTokenPayload {
  role: 'admin'
}

export interface AuthService {
  login(password: string): string | null
  verifyToken(token: string): boolean
}

export function hashPassphrase(passphrase: string) {
  return createHash('sha256').update(passphrase, 'utf8').digest('hex')
}

export function createAuthService(config: ServerConfig): AuthService {
  return {
    login(password) {
      if (!config.adminPassHash || !config.jwtSecret) return null
      if (!hashesMatch(hashPassphrase(password), config.adminPassHash)) return null

      return jwt.sign({ role: 'admin' } satisfies AdminTokenPayload, config.jwtSecret)
    },

    verifyToken(token) {
      if (!config.jwtSecret) return false

      try {
        const decoded = jwt.verify(token, config.jwtSecret) as Partial<AdminTokenPayload>
        return decoded.role === 'admin'
      } catch {
        return false
      }
    },
  }
}

export function requireAdmin(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readBearerToken(req)
    if (!token || !authService.verifyToken(token)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    next()
  }
}

export function registerAuthRoutes(app: import('express').Express, authService: AuthService) {
  app.post('/auth/login', (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const token = authService.login(password)

    if (!token) {
      res.status(401).json({ error: 'Invalid password' })
      return
    }

    res.json({ token })
  })

  app.get('/auth/me', requireAdmin(authService), (_req, res) => {
    res.json({ ok: true, role: 'admin' })
  })
}

function readBearerToken(req: Request) {
  const header = req.header('authorization')
  if (!header?.startsWith('Bearer ')) return ''
  return header.slice('Bearer '.length).trim()
}

function hashesMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
