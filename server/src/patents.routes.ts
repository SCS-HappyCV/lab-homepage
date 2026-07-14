/**
 * 简化的专利路由
 * 包含核心功能：列表查询、详情查询、下载、预览
 */
import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import { requireAdmin, type AuthService } from './auth.js'
import { createSimplePatentRepository } from './patent/simple-patent.repo.js'
import { createPatentFileRepository } from './patent/repositories/patent-file.repository.js'
import type { AppDatabase } from './db.js'

export interface PatentRouterDeps {
  db: AppDatabase
  authService: AuthService
  uploadDir: string
}

export function createPatentRouter({ db, authService, uploadDir }: PatentRouterDeps) {
  const router = Router()
  const adminOnly = requireAdmin(authService)
  const simplePatentRepo = createSimplePatentRepository(db)
  const fileRepo = createPatentFileRepository(db)

  /**
   * GET /patents
   * 获取专利列表（分页）
   */
  router.get('/patents', (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1)
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 10))
      const offset = (page - 1) * pageSize

      const patents = simplePatentRepo.list(pageSize, offset)
      const total = simplePatentRepo.count()
      const totalPages = Math.ceil(total / pageSize)

      // 转换为前端期望的格式
      const data = patents.map(p => ({
        id: p.id,
        title: p.patent_name,
        patent_number: p.patent_number,
        inventors: p.inventors,
        patent_type: p.patent_type,
        file_id: p.file_id,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }))

      res.json({
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      })
    } catch (error) {
      console.error('List patents error:', error)
      res.status(500).json({ error: '获取专利列表失败' })
    }
  })

  /**
   * GET /patents/:id
   * 获取单个专利详情
   */
  router.get('/patents/:id', (req, res) => {
    try {
      const id = String(req.params.id)

      const patent = simplePatentRepo.get(id)
      if (!patent) {
        res.status(404).json({ error: '专利不存在' })
        return
      }

      // 转换为前端期望的格式
      res.json({
        id: patent.id,
        title: patent.patent_name,
        patent_number: patent.patent_number,
        inventors: patent.inventors,
        patent_type: patent.patent_type,
        file_id: patent.file_id,
        createdAt: patent.created_at,
        updatedAt: patent.updated_at,
      })
    } catch (error) {
      console.error('Get patent error:', error)
      res.status(500).json({ error: '获取专利信息失败' })
    }
  })

  /**
   * DELETE /patents/:id
   * 删除专利（管理员）
   */
  router.delete('/patents/:id', adminOnly, (req, res) => {
    try {
      const id = String(req.params.id)

      const patent = simplePatentRepo.get(id)
      if (!patent) {
        res.status(404).json({ error: '专利不存在' })
        return
      }

      const deleted = simplePatentRepo.delete(id)
      if (!deleted) {
        res.status(500).json({ error: '删除专利失败' })
        return
      }

      res.status(204).send()
    } catch (error) {
      console.error('Delete patent error:', error)
      res.status(500).json({ error: '删除专利失败' })
    }
  })

  /**
   * GET /patents/:id/download
   * 下载专利PDF
   */
  router.get('/patents/:id/download', async (req, res) => {
    try {
      const id = String(req.params.id)

      const patent = simplePatentRepo.get(id)
      if (!patent) {
        res.status(404).json({ error: '专利不存在' })
        return
      }

      // 获取文件信息
      if (!patent.file_id) {
        res.status(404).json({ error: '专利文件不存在' })
        return
      }

      const file = fileRepo.get(patent.file_id)
      if (!file) {
        res.status(404).json({ error: '专利文件不存在' })
        return
      }

      // 使用数据库中存储的路径
      const filePath = path.resolve(file.storagePath)

      // 检查文件是否存在
      try {
        await fs.access(filePath)
      } catch {
        res.status(404).json({ error: 'PDF文件不存在' })
        return
      }

      // 设置下载响应头
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(patent.patent_name)}.pdf"`)

      // 发送文件
      res.sendFile(filePath)
    } catch (error) {
      console.error('Download patent error:', error)
      res.status(500).json({ error: '下载专利文件失败' })
    }
  })

  /**
   * GET /patents/:id/preview
   * 预览专利PDF
   */
  router.get('/patents/:id/preview', async (req, res) => {
    try {
      const id = String(req.params.id)

      const patent = simplePatentRepo.get(id)
      if (!patent) {
        res.status(404).json({ error: '专利不存在' })
        return
      }

      // 获取文件信息
      if (!patent.file_id) {
        res.status(404).json({ error: '专利文件不存在' })
        return
      }

      const file = fileRepo.get(patent.file_id)
      if (!file) {
        res.status(404).json({ error: '专利文件不存在' })
        return
      }

      // 使用数据库中存储的路径
      const filePath = path.resolve(file.storagePath)

      // 检查文件是否存在
      try {
        await fs.access(filePath)
      } catch {
        res.status(404).json({ error: 'PDF文件不存在' })
        return
      }

      // 设置预览响应头 - 允许 iframe 嵌入
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(patent.patent_name)}.pdf"`)
      res.setHeader('X-Frame-Options', 'ALLOWALL')
      res.setHeader('Content-Security-Policy', "frame-ancestors *")

      // 发送文件
      res.sendFile(filePath)
    } catch (error) {
      console.error('Preview patent error:', error)
      res.status(500).json({ error: '预览专利文件失败' })
    }
  })

  return router
}
