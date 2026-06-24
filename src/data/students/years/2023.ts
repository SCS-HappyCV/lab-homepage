import { studentPhoto } from '../helpers'
import type { StudentProfile } from '../types'

export default [
  {
    id: '2023-a',
    name: '伍志明',
    nativePlace: '湖南耒阳',
    wechat: 'w384z756m',
    cohort: '2023',
    degree: '硕士',
    role: '毕业生',
    status: 'alumni',
    photo: studentPhoto('2023', 'wu-zhiming.jpg'),
    research: ['变化检测'],
    email: 'zhimingwu2022@126.com',
    destination: '长沙万兴科技有限公司',
    bio: '在校期间关注水利遥感图像变化检测，建设了数据集 RLB-CD。担任实验室2024-2025生活委员。',
    achievements: [
      'Mamba-LiteDSN: Lightweight Dual-Stream Network for Efficient Remote Sensing Change Detection. IEEE Journal of Selected Topics in Applied Earth Observations and Remote Sensing. 中科院二区. JCR Q1.在投',
      '第七届“华为杯”中国研究生人工智能创新大赛全国二等奖',
      '一种融合Mamba增强的双流遥感影像变化检测方法.发明专利.已授权',
      '第六届湖南省研究生人工智能创新大赛二等奖',
    ],
    experiences: [
      '2019-2023 湖南中医药大学计算机科学与技术专业学习',
      '2023-2026 湘潭大学计算机技术专业攻读硕士学位',
      '2026 入职长沙万兴科技有限公司研发岗位',
    ],
  },
] satisfies StudentProfile[]
