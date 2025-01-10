<template>
  <div class="calendar-container">
    <div ref="calendarEl"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Calendar } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import multiMonthPlugin from '@fullcalendar/multimonth'
import interactionPlugin from '@fullcalendar/interaction'
import resourceTimelinePlugin from '@fullcalendar/resource-timeline'

const calendarEl = ref<HTMLElement>()

onMounted(() => {
  const calendar = new Calendar(calendarEl.value!, {
    plugins: [
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      multiMonthPlugin,
      interactionPlugin,
      resourceTimelinePlugin
    ],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay,listYear,multiMonthYear,resourceTimelineThreeDays'
    },
    views: {
      multiMonthYear: {
        type: 'multiMonthYear',
        duration: { years: 1 },
        buttonText: 'Year'
      },
      resourceTimelineThreeDays: {
        type: 'resourceTimeline',
        duration: { days: 3 },
        buttonText: '3 days'
      }
    }
  })
  calendar.render()
})
</script>

<style lang="scss">
.calendar-container {
  width: 100%;
  height: 100%;
  padding: 1rem;

  :deep(.fc) {
    height: 100%;
  }
}
</style>