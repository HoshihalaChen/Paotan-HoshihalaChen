import { defineStore } from 'pinia'
import { ref } from 'vue'
import { db } from '../db/index.js'

/** 地图相关状态管理 */
export const useMapStore = defineStore('map', () => {
  const mapConfig = ref(null)
  const layers = ref([
    { id: 'terrain', name: '地形', visible: true },
    { id: 'settlements', name: '聚落', visible: true },
    { id: 'routes', name: '路线', visible: true },
    { id: 'dungeons', name: '地下城', visible: false },
    { id: 'poi', name: '兴趣点', visible: true },
  ])
  const currentSeason = ref('spring')
  const currentDate = ref({ year: 1492, month: 6, day: 15 })

  const seasons = ['spring', 'summer', 'autumn', 'winter']
  const seasonLabels = { spring: '春季', summer: '夏季', autumn: '秋季', winter: '冬季' }

  /** 加载地图数据 */
  async function loadMapData(sessionId) {
    const data = await db.mapData.where('sessionId').equals(sessionId).first()
    if (data) {
      mapConfig.value = data.config
      if (data.layers) layers.value = data.layers
      if (data.season) currentSeason.value = data.season
      if (data.date) currentDate.value = data.date
    }
  }

  /** 保存地图配置 */
  async function saveMapData(sessionId) {
    const existing = await db.mapData.where('sessionId').equals(sessionId).first()
    const data = {
      sessionId,
      config: mapConfig.value,
      layers: layers.value,
      season: currentSeason.value,
      date: currentDate.value
    }
    if (existing) {
      await db.mapData.update(existing.id, data)
    } else {
      await db.mapData.add(data)
    }
  }

  /** 切换图层可见性 */
  function toggleLayer(layerId) {
    const layer = layers.value.find(l => l.id === layerId)
    if (layer) layer.visible = !layer.visible
  }

  /** 设置季节 */
  function setSeason(season) {
    currentSeason.value = season
  }

  /** 更新日期 */
  function updateDate(updates) {
    Object.assign(currentDate.value, updates)
  }

  return {
    mapConfig, layers, currentSeason, currentDate,
    seasons, seasonLabels,
    loadMapData, saveMapData, toggleLayer, setSeason, updateDate
  }
})
