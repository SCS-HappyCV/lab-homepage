import { studentPhoto } from '../helpers'
import type { StudentProfile } from '../types'

export default [
  {
    id: '2025-a',
    name: '袁彤',
    nativePlace: '湖南邵阳',
    wechat: 'Jack_Alice_',
    cohort: '2025',
    degree: '硕士研究生',
    role: '在读学生',
    status: 'current',
    photo: studentPhoto('2025', 'yuan-tong.jpg'),
    research: ['高光谱分类'],
    email: '202521633254@smail.xtu.edu.cn',
    bio: '研究方向为高光谱图像分类。担任实验室2026-2027生活委员。湘大秀才。',
    achievements: [
      '湘潭大学十佳歌手',
      '湘大杯篮球比赛亚军',
      '湘大杯足球比赛亚军',
      '湘大杯气排球比赛亚军',
      '湘潭大学校运会5000米冠军',
      '湘潭大学超级演说家',
    ],
    experiences: [
      '2021-2025 湘潭大学计算机科学与技术专业学习',
      '2025 湘潭大学计算机科学与技术专业攻读硕士学位',
    ],
  },
  {
    id: '2025-b',
    name: '2025届成员 B',
    cohort: '2025',
    degree: '硕士研究生',
    role: '在读学生',
    status: 'current',
    research: ['三维感知', '点云理解'],
    email: 'student2025b@example.com',
    bio: '关注三维场景理解与点云语义分析，参与水利与复杂室外场景相关研究。',
    achievements: ['参与三维语义分割实验', '完成点云数据处理流程建设'],
    experiences: ['2023-至今 三维视觉方向研究', '2024 参与实验室场景数据采集与标注'],
  },
] satisfies StudentProfile[]
