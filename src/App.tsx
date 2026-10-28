import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { courses, examQuestionCountFor, learningPath, loadCourse, totalLessons, type Course, type CourseId, type Lesson } from './curriculum'
import './App.css'

type Page = 'home' | 'courses' | 'course' | 'lesson' | 'projects' | 'exams' | 'exam' | 'result' | 'profile' | 'settings' | 'ai'
type SettingsTab = 'general' | 'feedback' | 'privacy' | 'notifications'
type ProjectState = { checked: string[]; repository: string; demo: string }
type FeedbackState = { rating: number; praise: string; improve: string; ideas: string }
type PrivacyState = { email: string; phone: string }
type ReminderState = { enabled: boolean; time: string; lastSentDate: string }
type AppData = {
    nickname: string
    theme: 'light' | 'dark'
    avatar: string
    progress: Partial<Record<CourseId, string[]>>
    quizAnswers: Record<string, number>
    practiceChecks: string[]
    projectStates: Partial<Record<CourseId, ProjectState>>
    lastCourse: CourseId
    feedback: FeedbackState
    privacy: PrivacyState
    reminder: ReminderState
}
type ExamItem = { lessonId: string; order: number[] }
type ExamAttempt = { id: number; courseId: CourseId; startedAt: number; expiresAt: number; items: ExamItem[]; answers: Record<string, number> }
type ExamResponse = { lessonId: string; selected?: number; correct: boolean }
type ExamResult = { courseId: CourseId; score: number; correct: number; total: number; passed: boolean; finishedAt: number; responses: ExamResponse[] }
type ExamResults = Partial<Record<CourseId, ExamResult>>

const dataKey = 'codecraft-academy-v2'
const attemptKey = 'codecraft-active-exam-v2'
const resultsKey = 'codecraft-exam-results-v2'
const defaults = (): AppData => ({ nickname: 'Разработчик', theme: 'light', avatar: '', progress: {}, quizAnswers: {}, practiceChecks: [], projectStates: {}, lastCourse: 'html', feedback: { rating: 0, praise: '', improve: '', ideas: '' }, privacy: { email: '', phone: '' }, reminder: { enabled: false, time: '19:00', lastSentDate: '' } })
function readStorage<T>(key: string, fallback: T): T {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
function readAppData(): AppData {
    const base = defaults()
    const saved = readStorage<Partial<AppData>>(dataKey, {})
    return { ...base, ...saved, feedback: { ...base.feedback, ...saved.feedback }, privacy: { ...base.privacy, ...saved.privacy }, reminder: { ...base.reminder, ...saved.reminder } }
}
function shuffle<T>(items: T[], seed: number): T[] {
    const result = [...items]
    let value = seed || 1
    for (let i = result.length - 1; i > 0; i--) {
        value = (value * 9301 + 49297) % 233280
        const j = Math.floor((value / 233280) * (i + 1))
        ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
}
function choiceOrder(key: string, length: number): number[] {
    const seed = Array.from(key).reduce((value, char) => (value * 31 + char.charCodeAt(0)) % 233280, 17)
    return shuffle(Array.from({ length }, (_, index) => index), seed)
}
function courseById(id: CourseId): Course { return courses.find(course => course.id === id) ?? courses[0] }
function completedFor(data: AppData, course: Course): string[] { return data.progress[course.id] ?? [] }
type Achievement = { id: string; title: string; description: string; category: string; icon: string; progress: number; target: number }
type LearningStats = { lessons: number; passed: number; completedCourses: number; checkedDeliverables: number; completedProjects: number; xp: number; level: number; levelProgress: number; nextLevelXp: number; achievements: Achievement[] }
function getLearningStats(data: AppData, results: ExamResults): LearningStats {
    const lessons = courses.reduce((sum, course) => sum + Math.min(course.lessonCount, completedFor(data, course).length), 0)
    const attempts = courses.filter(course => Boolean(results[course.id])).length
    const passed = courses.filter(course => Boolean(results[course.id]?.passed)).length
    const completedCourses = courses.filter(course => completedFor(data, course).length >= course.lessonCount && Boolean(results[course.id]?.passed))
    const projectProgress = courses.map(course => {
        const state = data.projectStates[course.id] ?? { checked: [], repository: '', demo: '' }
        const checked = state.checked.filter(item => course.project.deliverables.includes(item)).length
        return { course, state, checked, complete: checked === course.project.deliverables.length }
    })
    const checkedDeliverables = projectProgress.reduce((sum, project) => sum + project.checked, 0)
    const completedProjects = projectProgress.filter(project => project.complete).length
    const linkedProjects = projectProgress.filter(project => /^https?:\/\//i.test(project.state.repository.trim()) && /^https?:\/\//i.test(project.state.demo.trim())).length
    const xp = lessons * 35 + passed * 200 + checkedDeliverables * 25 + completedProjects * 100
    const thresholds = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250, 3850, 4500, 5200, 5950, 6750, 7500, 8150, 8800, 9450]
    const level = thresholds.reduce((value, threshold, index) => xp >= threshold ? index + 1 : value, 1)
    const currentXp = thresholds[level - 1]
    const nextLevelXp = thresholds[level] ?? currentXp
    const levelProgress = nextLevelXp === currentXp ? 100 : Math.min(100, Math.round((xp - currentXp) * 100 / (nextLevelXp - currentXp)))
    const maxScore = Math.max(0, ...courses.map(course => results[course.id]?.score ?? 0))
    const webCourseIds = learningPath.slice(0, 5)
    const webCoursesDone = webCourseIds.filter(id => completedCourses.some(course => course.id === id)).length
    const webBasicsDone = ['html', 'css'].filter(id => completedCourses.some(course => course.id === id)).length
    const webAdvancedDone = ['javascript', 'typescript', 'react'].filter(id => completedCourses.some(course => course.id === id)).length
    const achievements: Achievement[] = [
        { id: 'lesson-1', title: 'Первый шаг', description: 'Зачти первый урок.', category: 'Уроки', icon: '✦', progress: lessons, target: 1 },
        { id: 'lesson-10', title: 'Вошёл в ритм', description: 'Заверши 10 уроков.', category: 'Уроки', icon: '↗', progress: lessons, target: 10 },
        { id: 'lesson-50', title: 'Уверенная практика', description: 'Заверши 50 уроков.', category: 'Уроки', icon: '⌘', progress: lessons, target: 50 },
        { id: 'lesson-100', title: 'Большой путь', description: 'Заверши 100 уроков.', category: 'Уроки', icon: '◆', progress: lessons, target: 100 },
        { id: 'lesson-150', title: 'Почти академия', description: 'Заверши 150 уроков.', category: 'Уроки', icon: '◈', progress: lessons, target: 150 },
        { id: 'lesson-all', title: 'Все уроки', description: 'Заверши все уроки академии.', category: 'Уроки', icon: '🏆', progress: lessons, target: totalLessons },
        { id: 'exam-attempt', title: 'Первый экзамен', description: 'Начни и закончи экзамен.', category: 'Экзамены', icon: '◷', progress: attempts, target: 1 },
        { id: 'exam-pass-1', title: 'Сдано!', description: 'Сдай любой экзамен минимум на 80 баллов.', category: 'Экзамены', icon: '✓', progress: passed, target: 1 },
        { id: 'exam-pass-3', title: 'Три зачёта', description: 'Сдай экзамены по трём курсам.', category: 'Экзамены', icon: '✓', progress: passed, target: 3 },
        { id: 'exam-pass-7', title: 'Семь программ', description: 'Сдай экзамены по всем направлениям.', category: 'Экзамены', icon: '★', progress: passed, target: courses.length },
        { id: 'exam-90', title: 'Точность', description: 'Набери 90 баллов или больше.', category: 'Экзамены', icon: '◎', progress: maxScore >= 90 ? 1 : 0, target: 1 },
        { id: 'exam-perfect', title: 'Без ошибок', description: 'Получи 100 баллов на экзамене.', category: 'Экзамены', icon: '✧', progress: courses.some(course => results[course.id]?.score === 100) ? 1 : 0, target: 1 },
        { id: 'project-first-check', title: 'Первый артефакт', description: 'Отметь готовым один проверенный результат проекта.', category: 'Проекты', icon: '▣', progress: checkedDeliverables, target: 1 },
        { id: 'project-10-checks', title: 'Собираю портфолио', description: 'Выполни 10 пунктов проектных чек-листов.', category: 'Проекты', icon: '▤', progress: checkedDeliverables, target: 10 },
        { id: 'project-one', title: 'Первый готовый проект', description: 'Заверши чек-лист любого итогового проекта.', category: 'Проекты', icon: '◇', progress: completedProjects, target: 1 },
        { id: 'project-three', title: 'Три работы в портфолио', description: 'Заверши три итоговых проекта.', category: 'Проекты', icon: '◆', progress: completedProjects, target: 3 },
        { id: 'project-seven', title: 'Семь проектов', description: 'Заверши проект в каждом направлении.', category: 'Проекты', icon: '🏅', progress: completedProjects, target: courses.length },
        { id: 'project-links-1', title: 'Показываю работу', description: 'Добавь ссылки на репозиторий и демо одного проекта.', category: 'Портфолио', icon: '↗', progress: linkedProjects, target: 1 },
        { id: 'project-links-3', title: 'Открытое портфолио', description: 'Добавь репозитории и демо для трёх проектов.', category: 'Портфолио', icon: '🌐', progress: linkedProjects, target: 3 },
        { id: 'web-html-css', title: 'Структура и стиль', description: 'Заверши HTML и CSS с экзаменами.', category: 'Веб-путь', icon: 'H5', progress: webBasicsDone, target: 2 },
        { id: 'web-js-ts-react', title: 'Интерактивный веб', description: 'Заверши JavaScript, TypeScript и React.', category: 'Веб-путь', icon: 'JS', progress: webAdvancedDone, target: 3 },
        { id: 'web-complete', title: 'Frontend-разработчик', description: 'Заверши весь маршрут из пяти веб-курсов.', category: 'Веб-путь', icon: '⚡', progress: webCoursesDone, target: 5 },
        { id: 'level-5', title: 'Уровень 5', description: 'Набери опыт до пятого уровня.', category: 'Уровни', icon: 'Ⅴ', progress: level, target: 5 },
        { id: 'level-10', title: 'Уровень 10', description: 'Набери опыт до десятого уровня.', category: 'Уровни', icon: 'Ⅹ', progress: level, target: 10 },
        { id: 'level-15', title: 'Уровень 15', description: 'Набери опыт до пятнадцатого уровня.', category: 'Уровни', icon: 'ⅩⅤ', progress: level, target: 15 },
        { id: 'level-20', title: 'Уровень 20', description: 'Достигни максимального двадцатого уровня.', category: 'Уровни', icon: 'ⅩⅩ', progress: level, target: 20 },
        ...courses.map(course => ({ id: 'course-' + course.id, title: course.name + ': финиш', description: 'Заверши все уроки и сдай экзамен по курсу ' + course.name + '.', category: 'Курсы', icon: course.icon, progress: completedCourses.some(done => done.id === course.id) ? 1 : 0, target: 1 })),
    ]
    return { lessons, passed, completedCourses: completedCourses.length, checkedDeliverables, completedProjects, xp, level, levelProgress, nextLevelXp, achievements }
}
function formatTime(milliseconds: number): string {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
    return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}
function squareCropRect(width: number, height: number, zoom: number, xPercent: number, yPercent: number) {
    const side = Math.min(width, height) / zoom
    return { side, x: Math.max(0, width - side) * xPercent / 100, y: Math.max(0, height - side) * yPercent / 100 }
}
function cropPreviewStyle(dimensions: { width: number; height: number }, zoom: number, xPercent: number, yPercent: number): CSSProperties {
    const crop = squareCropRect(dimensions.width, dimensions.height, zoom, xPercent, yPercent)
    const scale = 180 / crop.side
    return { position: 'absolute', width: dimensions.width * scale, height: dimensions.height * scale, left: -crop.x * scale, top: -crop.y * scale, maxWidth: 'none', maxHeight: 'none' }
}
function gradeAttempt(attempt: ExamAttempt, course: Course): ExamResult {
    const responses = attempt.items.map(item => {
        const lesson = course.lessons.find(entry => entry.id === item.lessonId)!
        const selected = attempt.answers[item.lessonId]
        return { lessonId: item.lessonId, selected, correct: selected === lesson.answer }
    })
    const correct = responses.filter(response => response.correct).length
    const total = responses.length
    const score = Math.round(correct * 100 / total)
    return { courseId: attempt.courseId, score, correct, total, passed: score >= 80, finishedAt: Date.now(), responses }
}
function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
    return <button className={['nav-button', active ? 'nav-button-active' : ''].join(' ')} onClick={onClick}><span className="nav-glyph">{icon}</span><span>{label}</span>{active && <span className="nav-current">●</span>}</button>
}
function CourseMark({ course, large = false }: { course: Course; large?: boolean }) {
    return <span className={['course-mark', 'mark-' + course.color, large ? 'mark-large' : ''].join(' ')}>{course.icon}</span>
}
function CourseCard({ course, done, onOpen }: { course: Course; done: number; onOpen: () => void }) {
    const completed = Math.min(done, course.lessonCount)
    const percent = Math.round(completed / course.lessonCount * 100)
    return <button className="course-card" onClick={onOpen}>
        <div className="card-top"><CourseMark course={course} /><span className="course-level">{course.level}</span></div>
        <h3>{course.name}</h3><p>{course.description}</p>
        <div className="course-card-meta"><span>{course.lessonCount} уроков</span><span>{course.hours} ч практики</span></div>
        <div className="progress-track"><span style={{ width: percent + '%' }} /></div>
        <div className="progress-note"><span>{completed} из {course.lessonCount} уроков</span><b>{percent}%</b></div>
    </button>
}
function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
    return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

export default function App() {
    const [data, setData] = useState<AppData>(readAppData)
    const [examResults, setExamResults] = useState<ExamResults>(() => readStorage(resultsKey, {}))
    const [examAttempt, setExamAttempt] = useState<ExamAttempt | null>(() => readStorage(attemptKey, null))
    const [loadedCourses, setLoadedCourses] = useState<Partial<Record<CourseId, Course>>>({})
    const [loadingCourseId, setLoadingCourseId] = useState<CourseId | null>(null)
    const [page, setPage] = useState<Page>(() => readStorage<ExamAttempt | null>(attemptKey, null) ? 'exam' : 'home')
    const [courseId, setCourseId] = useState<CourseId>(examAttempt?.courseId ?? 'html')
    const [lessonId, setLessonId] = useState('')
    const [search, setSearch] = useState('')
    const [menuOpen, setMenuOpen] = useState(false)
    const [clock, setClock] = useState(0)
    const [examIndex, setExamIndex] = useState(0)
    const [diplomaId, setDiplomaId] = useState<CourseId | null>(null)
    const [cropSource, setCropSource] = useState('')
    const [cropDimensions, setCropDimensions] = useState<{ width: number; height: number } | null>(null)
    const [cropZoom, setCropZoom] = useState(1)
    const [cropX, setCropX] = useState(50)
    const [cropY, setCropY] = useState(50)
    const [notice, setNotice] = useState('')
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    const courseCacheRef = useRef<Partial<Record<CourseId, Course>>>({})
    const pendingLoadsRef = useRef<Partial<Record<CourseId, Promise<Course>>>>({})
    const navigationRequestRef = useRef(0)
    const finishingExamRef = useRef<number | null>(null)
    const ensureCourse = useCallback((id: CourseId): Promise<Course> => {
        const cached = courseCacheRef.current[id]
        if (cached) return Promise.resolve(cached)
        const pending = pendingLoadsRef.current[id]
        if (pending) return pending
        const request = loadCourse(id).then(course => {
            courseCacheRef.current[id] = course
            setLoadedCourses(previous => previous[id] ? previous : { ...previous, [id]: course })
            return course
        }).finally(() => { delete pendingLoadsRef.current[id] })
        pendingLoadsRef.current[id] = request
        return request
    }, [])
    const currentCourse = loadedCourses[courseId] ?? courseById(courseId)
    const currentLesson = currentCourse.lessons.find(lesson => lesson.id === lessonId) ?? null
    const savedExamCourseId = examAttempt?.courseId
    const completed = completedFor(data, currentCourse)
    const allDone = courses.reduce((sum, course) => sum + Math.min(course.lessonCount, completedFor(data, course).length), 0)
    const passedExams = courses.filter(course => examResults[course.id]?.passed).length

    useEffect(() => {
        try { localStorage.setItem(dataKey, JSON.stringify(data)) } catch (error) { console.warn('Не удалось сохранить данные профиля', error) }
        document.documentElement.dataset.theme = data.theme
    }, [data])
    useEffect(() => { try { localStorage.setItem(resultsKey, JSON.stringify(examResults)) } catch (error) { console.warn('Не удалось сохранить результаты экзамена', error) } }, [examResults])
    useEffect(() => {
        try { if (examAttempt) localStorage.setItem(attemptKey, JSON.stringify(examAttempt)); else localStorage.removeItem(attemptKey) } catch (error) { console.warn('Не удалось сохранить активный экзамен', error) }
    }, [examAttempt])
    useEffect(() => {
        if (savedExamCourseId) void ensureCourse(savedExamCourseId).catch(() => setNotice('Не удалось загрузить курс для экзамена. Проверь подключение и повтори попытку.'))
    }, [savedExamCourseId, ensureCourse])
    useEffect(() => {
        if (!data.reminder.enabled || notificationPermission !== 'granted') return
        const checkReminder = () => {
            const now = new Date()
            const today = now.toLocaleDateString('sv-SE')
            const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
            if (time !== data.reminder.time || data.reminder.lastSentDate === today) return
            try {
                new Notification('Пора на короткий урок', { body: 'Продолжи обучение в CODECRAFT Academy — даже 15 минут практики имеют значение.' })
                setData(previous => ({ ...previous, reminder: { ...previous.reminder, lastSentDate: today } }))
            } catch { setNotificationPermission('unsupported') }
        }
        const timer = window.setInterval(checkReminder, 20_000)
        checkReminder()
        return () => window.clearInterval(timer)
    }, [data.reminder, notificationPermission])

    function go(next: Page) { navigationRequestRef.current += 1; setLoadingCourseId(null); setPage(next); setMenuOpen(false); setNotice(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    async function openCourse(id: CourseId, continueToLesson = false) {
        const requestId = ++navigationRequestRef.current
        setLoadingCourseId(id); setNotice('')
        try {
            const course = await ensureCourse(id)
            if (requestId !== navigationRequestRef.current) return
            setCourseId(id); setData(prev => ({ ...prev, lastCourse: id }))
            const first = course.lessons.find(lesson => !(data.progress[id] ?? []).includes(lesson.id)) ?? course.lessons[0]
            setLessonId(first?.id ?? '')
            go(continueToLesson ? 'lesson' : 'course')
        } catch { setNotice('Не удалось загрузить материалы курса. Обнови страницу и попробуй ещё раз.') }
        finally { if (requestId === navigationRequestRef.current) setLoadingCourseId(null) }
    }
    async function openLesson(id: CourseId, targetLessonId: string) {
        const requestId = ++navigationRequestRef.current
        setLoadingCourseId(id); setNotice('')
        try {
            const course = await ensureCourse(id)
            if (requestId !== navigationRequestRef.current) return
            if (!course.lessons.some(lesson => lesson.id === targetLessonId)) throw new Error('Lesson not found')
            setCourseId(id); setLessonId(targetLessonId); setData(prev => ({ ...prev, lastCourse: id })); go('lesson')
        } catch { setNotice('Не удалось открыть урок. Обнови страницу и попробуй ещё раз.') }
        finally { if (requestId === navigationRequestRef.current) setLoadingCourseId(null) }
    }
    function completeLesson(lesson: Lesson) {
        if (data.quizAnswers[lesson.id] !== lesson.answer || !data.practiceChecks.includes(lesson.id)) return
        setData(prev => ({ ...prev, progress: { ...prev.progress, [courseId]: [...new Set([...(prev.progress[courseId] ?? []), lesson.id])] } }))
        setNotice('Урок зачтён. Отличная работа — переходи к следующей практике.')
    }
    const startExam = useCallback(async (id: CourseId) => {
        const requestId = ++navigationRequestRef.current
        setLoadingCourseId(id); setNotice('')
        try {
        const course = await ensureCourse(id)
        if (requestId !== navigationRequestRef.current) return
        const now = Date.now()
        const selected = shuffle(course.lessons, now + course.lessonCount).slice(0, examQuestionCountFor(course))
        const attempt: ExamAttempt = {
            id: now, courseId: id, startedAt: now, expiresAt: now + course.examMinutes * 60_000,
            items: selected.map((lesson, index) => ({ lessonId: lesson.id, order: shuffle(lesson.options.map((_, optionIndex) => optionIndex), now + index * 719 + lesson.id.length) })),
            answers: {},
        }
        setExamAttempt(attempt); setCourseId(id); setExamIndex(0); setClock(now); setPage('exam'); setMenuOpen(false); setNotice('')
        } catch { setNotice('Не удалось подготовить экзамен. Попробуй открыть его ещё раз.') }
        finally { if (requestId === navigationRequestRef.current) setLoadingCourseId(null) }
    }, [ensureCourse])
    const finishExam = useCallback((attempt: ExamAttempt) => {
        if (finishingExamRef.current === attempt.id) return
        finishingExamRef.current = attempt.id
        void ensureCourse(attempt.courseId).then(course => {
            const result = gradeAttempt(attempt, course)
            setExamResults(prev => ({ ...prev, [attempt.courseId]: result }))
            setExamAttempt(null); setCourseId(attempt.courseId); setPage('result'); setMenuOpen(false)
        }).catch(() => setNotice('Не удалось проверить экзамен: материалы курса не загрузились.')).finally(() => { finishingExamRef.current = null })
    }, [ensureCourse])
    useEffect(() => {
        if (!examAttempt) return
        const timer = window.setInterval(() => {
            const now = Date.now()
            setClock(now)
            if (now >= examAttempt.expiresAt) finishExam(examAttempt)
        }, 500)
        return () => window.clearInterval(timer)
    }, [examAttempt, finishExam])

    function updateExamAnswer(questionId: string, answerIndex: number) {
        setExamAttempt(prev => prev ? { ...prev, answers: { ...prev.answers, [questionId]: answerIndex } } : prev)
    }
    function setPracticeChecked(id: string, checked: boolean) {
        setData(prev => ({ ...prev, practiceChecks: checked ? [...new Set([...prev.practiceChecks, id])] : prev.practiceChecks.filter(item => item !== id) }))
    }
    function updateProject(id: CourseId, patch: Partial<ProjectState>) {
        setData(prev => {
            const old = prev.projectStates[id] ?? { checked: [], repository: '', demo: '' }
            return { ...prev, projectStates: { ...prev.projectStates, [id]: { ...old, ...patch } } }
        })
    }
    async function requestReminderPermission() {
        if (typeof Notification === 'undefined') { setNotificationPermission('unsupported'); setNotice('Этот браузер не поддерживает уведомления.'); return }
        try {
            const permission = await Notification.requestPermission()
            setNotificationPermission(permission)
            if (permission === 'granted') setData(prev => ({ ...prev, reminder: { ...prev.reminder, enabled: true } }))
            else setNotice(permission === 'denied' ? 'Уведомления запрещены в настройках браузера.' : 'Разрешение на уведомления не выдано.')
        } catch { setNotificationPermission('unsupported'); setNotice('Не удалось запросить разрешение на уведомления.') }
    }
    function selectPhoto(file?: File) {
        if (!file) return
        if (!file.type.startsWith('image/')) { setNotice('Выбери файл изображения.'); return }
        if (file.size > 8 * 1024 * 1024) { setNotice('Фото должно быть не больше 8 МБ.'); return }
        const reader = new FileReader()
        reader.onload = () => {
            const source = String(reader.result ?? '')
            const image = new Image()
            image.onload = () => { setCropDimensions({ width: image.naturalWidth, height: image.naturalHeight }); setCropSource(source); setCropZoom(1.25); setCropX(50); setCropY(50) }
            image.onerror = () => setNotice('Не удалось открыть изображение.')
            image.src = source
        }
        reader.readAsDataURL(file)
    }
    function savePhoto() {
        if (!cropSource) return
        const image = new Image()
        image.onload = () => {
            const crop = squareCropRect(image.naturalWidth, image.naturalHeight, cropZoom, cropX, cropY)
            const canvas = document.createElement('canvas')
            canvas.width = 384; canvas.height = 384
            const context = canvas.getContext('2d')
            if (!context) { setNotice('Браузер не смог обработать это фото.'); return }
            context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, 384, 384)
            try { setData(prev => ({ ...prev, avatar: canvas.toDataURL('image/webp', 0.82) })); setCropSource('') }
            catch { setNotice('Не получилось сохранить фото. Выбери изображение поменьше.') }
        }
        image.onerror = () => setNotice('Не удалось открыть изображение.')
        image.src = cropSource
    }
    function exportBackup() {
        const profile = { ...data, privacy: { email: '', phone: '' } }
        const blob = new Blob([JSON.stringify({ profile, examResults, note: 'Контактные данные исключены из резервной копии.' }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = 'codecraft-backup.json'; link.click(); URL.revokeObjectURL(url)
    }
    function certificateAvailable(course: Course): boolean {
        const done = completedFor(data, course)
        return done.length === course.lessonCount && Boolean(examResults[course.id]?.passed)
    }

    const activeExamCourse = examAttempt ? loadedCourses[examAttempt.courseId] ?? courseById(examAttempt.courseId) : null
    const examItem = examAttempt?.items[examIndex]
    const examLesson = examItem && activeExamCourse?.lessons.find(lesson => lesson.id === examItem.lessonId)
    const remainingMs = examAttempt ? Math.max(0, examAttempt.expiresAt - (clock || examAttempt.startedAt)) : 0
    const result = examResults[courseId]
    const diplomaCourse = diplomaId ? courseById(diplomaId) : null
    const nextCourseId = learningPath.find(id => completedFor(data, courseById(id)).length < courseById(id).lessonCount) ?? 'react'
    const nextCourse = courseById(nextCourseId)
    const learningStats = getLearningStats(data, examResults)

    return <div className={['academy-shell', 'theme-' + data.theme].join(' ')}>
        {menuOpen && <button className="mobile-scrim" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)} />}
        <aside className={['sidebar', menuOpen ? 'sidebar-open' : ''].join(' ')}>
            <button className="brand" onClick={() => go('home')}><span className="brand-mark">C</span><span><b>CODECRAFT</b><small>ACADEMY</small></span></button>
            <div className="side-label">ОБУЧЕНИЕ</div>
            <nav className="main-nav" aria-label="Главная навигация">
                <NavButton active={page === 'home'} icon="⌂" label="Главная" onClick={() => go('home')} />
                <NavButton active={page === 'courses' || page === 'course' || page === 'lesson'} icon="▤" label="Мои курсы" onClick={() => go('courses')} />
                <NavButton active={page === 'projects'} icon="◇" label="Проекты" onClick={() => go('projects')} />
                <NavButton active={page === 'exams' || page === 'exam' || page === 'result'} icon="✓" label="Экзамены" onClick={() => go(examAttempt ? 'exam' : 'exams')} />
                <NavButton active={page === 'ai'} icon="✧" label="ИИ-наставник" onClick={() => go('ai')} />
            </nav>
            <div className="side-label side-label-courses">КУРСЫ</div>
            <div className="quick-courses">{courses.map(course => <button key={course.id} className="quick-course" onClick={() => openCourse(course.id)}><CourseMark course={course} /><span>{course.name}</span><span className="quick-count">{completedFor(data, course).length}/{course.lessonCount}</span></button>)}</div>
            <div className="sidebar-bottom">
                <NavButton active={page === 'profile'} icon="◉" label="Профиль и дипломы" onClick={() => go('profile')} />
                <NavButton active={page === 'settings'} icon="⚙" label="Настройки" onClick={() => go('settings')} />
                <div className="side-user"><Avatar name={data.nickname} src={data.avatar} /><div><b>{data.nickname}</b><span>{allDone} уроков завершено</span></div></div>
            </div>
        </aside>
        <div className="main-column">
            <header className="topbar">
                <button className="mobile-menu-button" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">☰</button>
                <div className="breadcrumbs"><span>Академия</span><span className="crumb-slash">/</span><b>{pageTitle(page, currentCourse, currentLesson)}</b></div>
                <div className="top-actions">
                    <button className="icon-button theme-toggle" onClick={() => setData(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }))} title="Переключить тему" aria-label="Переключить тему">{data.theme === 'light' ? '☾' : '☼'}</button>
                    <button className="top-profile" onClick={() => go('profile')}><Avatar name={data.nickname} src={data.avatar} /><span>{data.nickname}</span></button>
                </div>
            </header>
            <main className="content-area">
                {notice && <div className="notice-banner" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Закрыть уведомление">×</button></div>}
                {loadingCourseId && <div className="course-loading" role="status" aria-live="polite">Загружаем материалы курса «{courseById(loadingCourseId).name}»…</div>}
                {page === 'home' && <Dashboard data={data} allDone={allDone} passedExams={passedExams} nextCourse={nextCourse} onContinue={() => openCourse(nextCourse.id, true)} onOpenCourse={openCourse} onOpenPage={go} />}
                {page === 'courses' && <CoursesPage data={data} search={search} setSearch={setSearch} onOpen={openCourse} />}
                {page === 'course' && <CourseOverview course={currentCourse} done={completed} result={examResults[currentCourse.id]} onBack={() => go('courses')} onOpenLesson={id => openLesson(currentCourse.id, id)} onExam={() => startExam(currentCourse.id)} />}
                {page === 'lesson' && currentLesson && <LessonView key={currentLesson.id} course={currentCourse} lesson={currentLesson} index={currentCourse.lessons.findIndex(item => item.id === currentLesson.id)} total={currentCourse.lessonCount} done={completed.includes(currentLesson.id)} answer={data.quizAnswers[currentLesson.id]} practiceChecked={data.practiceChecks.includes(currentLesson.id)} onBack={() => go('course')} onAnswer={answer => setData(prev => ({ ...prev, quizAnswers: { ...prev.quizAnswers, [currentLesson.id]: answer } }))} onPractice={checked => setPracticeChecked(currentLesson.id, checked)} onComplete={() => completeLesson(currentLesson)} onNavigate={id => openLesson(currentCourse.id, id)} onExam={() => startExam(currentCourse.id)} />}
                {page === 'projects' && <ProjectsPage data={data} onUpdate={updateProject} onCourse={openCourse} />}
                {page === 'exams' && <ExamsPage data={data} results={examResults} activeAttempt={examAttempt} onStart={startExam} onCourse={openCourse} onResume={() => go('exam')} />}
                {page === 'exam' && examAttempt && activeExamCourse && !examLesson && <div className="empty-state"><p role="status">Загружаем вопросы экзамена…</p></div>}
                {page === 'exam' && examAttempt && activeExamCourse && examLesson && examItem && <ExamPage course={activeExamCourse} attempt={examAttempt} item={examItem} lesson={examLesson} index={examIndex} remaining={remainingMs} onIndex={setExamIndex} onAnswer={updateExamAnswer} onFinish={() => finishExam(examAttempt)} onQuit={() => go('exams')} />}
                {page === 'exam' && !examAttempt && <ExamsPage data={data} results={examResults} activeAttempt={examAttempt} onStart={startExam} onCourse={openCourse} onResume={() => go('exam')} />}
                {page === 'result' && result && <ExamResultPage result={result} course={currentCourse} onCourse={() => go('course')} onLesson={id => openLesson(currentCourse.id, id)} onRetry={() => startExam(currentCourse.id)} onDiploma={() => setDiplomaId(currentCourse.id)} canGetDiploma={certificateAvailable(currentCourse)} />}
                {page === 'result' && !result && <ExamsPage data={data} results={examResults} activeAttempt={examAttempt} onStart={startExam} onCourse={openCourse} onResume={() => go('exam')} />}
                {page === 'profile' && <ProfilePage data={data} results={examResults} stats={learningStats} certificates={courses.filter(certificateAvailable)} onName={nickname => setData(prev => ({ ...prev, nickname }))} onPhoto={selectPhoto} onDiploma={id => setDiplomaId(id)} onCourse={openCourse} />}
                {page === 'settings' && <SettingsPage data={data} permission={notificationPermission} onTheme={() => setData(prev => ({ ...prev, theme: prev.theme === 'light' ? 'dark' : 'light' }))} onBackup={exportBackup} onProfile={() => go('profile')} onFeedback={feedback => setData(prev => ({ ...prev, feedback }))} onPrivacy={privacy => setData(prev => ({ ...prev, privacy }))} onReminder={reminder => setData(prev => ({ ...prev, reminder }))} onRequestPermission={requestReminderPermission} />}
                {page === 'ai' && <AIPage nickname={data.nickname} />}
            </main>
            <footer className="site-footer"><span>CODECRAFT Academy</span><span>Учись через объяснение, практику и проверку результата.</span></footer>
        </div>

        {cropSource && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCropSource('') }}>
            <section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
                <div className="modal-heading"><div><span className="eyebrow">ФОТО ПРОФИЛЯ</span><h2 id="crop-title">Настрой аватар</h2></div><button className="icon-button" onClick={() => setCropSource('')} aria-label="Закрыть">×</button></div>
                <p>Передвинь масштаб и положение. В круге показано, как фото будет выглядеть в профиле.</p>
                <div className="crop-preview"><img src={cropSource} alt="Предпросмотр фотографии" style={cropDimensions ? cropPreviewStyle(cropDimensions, cropZoom, cropX, cropY) : undefined} /></div>
                <label className="range-label">Масштаб <b>{cropZoom.toFixed(1)}×</b><input type="range" min="1" max="3" step="0.05" value={cropZoom} onChange={event => setCropZoom(Number(event.target.value))} /></label>
                <label className="range-label">Положение по горизонтали<input type="range" min="0" max="100" value={cropX} onChange={event => setCropX(Number(event.target.value))} /></label>
                <label className="range-label">Положение по вертикали<input type="range" min="0" max="100" value={cropY} onChange={event => setCropY(Number(event.target.value))} /></label>
                <div className="modal-actions"><button className="button-secondary" onClick={() => setCropSource('')}>Отмена</button><button className="button-primary" onClick={savePhoto}>Сохранить фото</button></div>
            </section>
        </div>}
        {diplomaCourse && <DiplomaModal course={diplomaCourse} nickname={data.nickname} result={examResults[diplomaCourse.id]} onClose={() => setDiplomaId(null)} />}
    </div>
}

function pageTitle(page: Page, course: Course, lesson: Lesson | null): string {
    if (page === 'home') return 'Главная'
    if (page === 'courses') return 'Мои курсы'
    if (page === 'course') return course.name
    if (page === 'lesson') return lesson?.title ?? 'Урок'
    if (page === 'projects') return 'Проекты'
    if (page === 'exams' || page === 'exam' || page === 'result') return 'Экзамены'
    if (page === 'profile') return 'Профиль'
    if (page === 'ai') return 'ИИ-наставник'
    return 'Настройки'
}
function Avatar({ name, src }: { name: string; src: string }) {
    return <span className="avatar">{src ? <img src={src} alt="" /> : name.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || 'У'}</span>
}

function Dashboard({ data, allDone, passedExams, nextCourse, onContinue, onOpenCourse, onOpenPage }: { data: AppData; allDone: number; passedExams: number; nextCourse: Course; onContinue: () => void; onOpenCourse: (id: CourseId) => void; onOpenPage: (page: Page) => void }) {
    const percent = Math.round(allDone / totalLessons * 100)
    return <div className="dashboard-page">
        <section className="welcome-hero">
            <div className="hero-copy"><span className="eyebrow">ТВОЯ ПРОФЕССИОНАЛЬНАЯ ПРАКТИКА</span><h1>Привет, {data.nickname}.<br /><em>Пора строить.</em></h1><p>Короткие объяснения, разбор кода и проекты, которые можно показать работодателю или заказчику.</p><button className="button-light" onClick={onContinue}>Продолжить обучение <span>→</span></button><div className="hero-footnote"><span>○</span> Твой прогресс сохраняется на этом устройстве</div></div>
            <div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="code-window"><div className="code-dots"><i /><i /><i /></div><div className="art-code"><span>01</span> <b>function</b> buildProject() {'{'}</div><div className="art-code"><span>02</span> &nbsp;learn(<strong>\"by doing\"</strong>);</div><div className="art-code"><span>03</span> &nbsp;<b>return</b> <strong>your next step</strong>;</div><div className="art-code"><span>04</span> {'}'}</div><div className="hero-cursor">▍</div></div><div className="floating-badge badge-lesson">✦ <span>урок за уроком</span></div><div className="floating-badge badge-project">↗ <span>проект в портфолио</span></div></div>
        </section>
        <section className="metric-grid">
            <Metric icon="▤" label="Уроки пройдены" value={allDone + ' / ' + totalLessons} detail={percent + '% программы'} tone="violet" />
            <Metric icon="✓" label="Экзамены сданы" value={String(passedExams)} detail="Порог успешной сдачи — 80%" tone="mint" />
            <Metric icon="◇" label="Курсы в академии" value={String(courses.length)} detail="От первой страницы до приложений" tone="amber" />
        </section>
        <section className="continue-panel">
            <div><span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span><h2>{nextCourse.name} <span>/</span> Продолжить обучение</h2><p>Открой следующий незавершённый урок и продолжи с того места, где остановился.</p></div><button className="button-primary" onClick={onContinue}>К уроку <span>→</span></button>
        </section>
        <div className="section-heading"><div><span className="eyebrow">ПРОГРАММЫ</span><h2>Выбери направление</h2></div><button className="text-action" onClick={() => onOpenPage('courses')}>Все курсы <span>→</span></button></div>
        <div className="course-grid">{courses.slice(0, 4).map(course => <CourseCard key={course.id} course={course} done={completedFor(data, course).length} onOpen={() => onOpenCourse(course.id)} />)}</div>
        <section className="home-bottom-grid">
            <div className="panel home-path"><div className="section-heading compact"><div><span className="eyebrow">ПОРЯДОК ОБУЧЕНИЯ</span><h3>Путь Frontend-разработчика</h3></div></div><div className="path-row">{learningPath.slice(0, 5).map((id, index) => { const course = courseById(id); return <button key={id} onClick={() => onOpenCourse(id)} className="path-step"><span className="path-number">{completedFor(data, course).length === course.lessonCount ? '✓' : String(index + 1).padStart(2, '0')}</span><CourseMark course={course} /><span>{course.name}</span><span className="path-line" /></button> })}</div><p className="muted-note">Сначала основы веба, затем типизация и React. Python и C++ идут отдельными направлениями.</p></div>
            <div className="panel exam-promo"><span className="promo-icon">◷</span><span className="eyebrow">ПРОВЕРЬ СЕБЯ</span><h3>Экзамен — больше, чем галочка</h3><p>Ограниченное время, оценка по шкале 0–100 и список конкретных тем для повторения.</p><button className="button-secondary" onClick={() => onOpenPage('exams')}>К экзаменам <span>→</span></button></div>
        </section>
    </div>
}
function Metric({ icon, label, value, detail, tone }: { icon: string; label: string; value: string; detail: string; tone: string }) {
    return <div className="metric-card"><span className={'metric-icon metric-' + tone}>{icon}</span><div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></div>
}
function CoursesPage({ data, search, setSearch, onOpen }: { data: AppData; search: string; setSearch: (value: string) => void; onOpen: (id: CourseId) => void }) {
    const filtered = courses.filter(course => (course.name + ' ' + course.description).toLowerCase().includes(search.toLowerCase()))
    return <div><PageHeading eyebrow="КАТАЛОГ" title="Мои курсы" description="Каждый курс включает подробные уроки, практические задания, проект и итоговый экзамен." /><label className="course-search"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Найти курс" aria-label="Найти курс" /></label><div className="course-grid course-grid-all">{filtered.map(course => <CourseCard key={course.id} course={course} done={completedFor(data, course).length} onOpen={() => onOpen(course.id)} />)}</div>{filtered.length === 0 && <div className="empty-state"><h3>Ничего не найдено</h3><p>Попробуй изменить запрос.</p></div>}</div>
}
function CourseOverview({ course, done, result, onBack, onOpenLesson, onExam }: { course: Course; done: string[]; result?: ExamResult; onBack: () => void; onOpenLesson: (id: string) => void; onExam: () => void }) {
    const [expanded, setExpanded] = useState<string | null>(course.lessons[0]?.module ?? null)
    const groups = course.lessons.reduce<Record<string, Lesson[]>>((all, lesson) => ({ ...all, [lesson.module]: [...(all[lesson.module] ?? []), lesson] }), {})
    const percent = Math.round(done.length / course.lessonCount * 100)
    return <div className="course-overview-page">
        <button className="back-link" onClick={onBack}>← Все курсы</button>
        <section className={'course-hero course-hero-' + course.color}><CourseMark course={course} large /><div className="course-hero-copy"><span className="eyebrow">{course.level} · {course.hours} ЧАСОВ ПРАКТИКИ</span><h1>{course.name}</h1><p>{course.description}</p><div className="course-hero-actions"><button className="button-primary" onClick={() => onOpenLesson(course.lessons.find(lesson => !done.includes(lesson.id))?.id ?? course.lessons[0].id)}>{done.length ? 'Продолжить курс' : 'Начать курс'} <span>→</span></button><button className="button-secondary" onClick={onExam}>Пробный экзамен <span>◷</span></button></div></div><div className="course-progress-ring" style={{ '--progress': percent + '%' } as CSSProperties}><strong>{percent}%</strong><span>пройдено</span></div></section>
        <section className="course-introduction panel"><span className="eyebrow">СНАЧАЛА РАЗБЕРЁМСЯ В ПРЕДМЕТЕ</span><h2>Что такое {course.name}?</h2><p>{course.introduction}</p><div className="use-case-list"><b>Где это применяют</b><div>{course.useCases.map(item => <span key={item}>{item}</span>)}</div></div></section>
        <div className="course-detail-grid"><div className="course-syllabus">
            <div className="section-heading"><div><span className="eyebrow">УЧЕБНЫЙ ПЛАН</span><h2>{course.lessonCount} подробных уроков</h2></div><span className="syllabus-total">{done.length}/{course.lessonCount}</span></div>
            {Object.entries(groups).map(([module, lessons], groupIndex) => {
                const groupDone = lessons.filter(lesson => done.includes(lesson.id)).length
                return <section className="module-card" key={module}><button className="module-heading" onClick={() => setExpanded(expanded === module ? null : module)} aria-expanded={expanded === module}><span className="module-number">{String(groupIndex + 1).padStart(2, '0')}</span><span className="module-title">{module}<small>{lessons.length} уроков · {groupDone} завершено</small></span><span className="module-chevron">{expanded === module ? '−' : '+'}</span></button>{expanded === module && <div className="module-lessons">{lessons.map((lesson, index) => <button key={lesson.id} className="syllabus-lesson" onClick={() => onOpenLesson(lesson.id)}><span className={['lesson-status', done.includes(lesson.id) ? 'status-done' : ''].join(' ')}>{done.includes(lesson.id) ? '✓' : String(index + 1).padStart(2, '0')}</span><span><b>{lesson.title}</b><small>{lesson.goal}</small></span><span className="lesson-arrow">→</span></button>)}</div>}</section>
            })}
        </div><aside className="course-aside"><div className="panel"><span className="eyebrow">ЧЕМУ НАУЧИШЬСЯ</span><ul className="skill-list">{course.skills.map(skill => <li key={skill}><span>✓</span>{skill}</li>)}</ul><div className="aside-divider" /><b>До начала</b><p>{course.prerequisites}</p><div className="aside-divider" /><b>Итоговый проект</b><p>{course.project.title}</p><small>{course.project.brief}</small></div><div className="exam-mini"><span>◷</span><div><b>Итоговый экзамен</b><p>{examQuestionCountFor(course)} вопросов · {course.examMinutes} минут · зачёт от 80%</p></div><button onClick={onExam} aria-label="Начать экзамен">→</button></div>{result && <div className="last-result-panel"><b>Последняя попытка: {result.score}/100</b><span className={result.passed ? 'result-good' : 'result-needs-work'}>{result.passed ? 'Экзамен сдан' : 'Нужно повторить темы'}</span></div>}</aside></div>
    </div>
}
function LessonView({ course, lesson, index, total, done, answer, practiceChecked, onBack, onAnswer, onPractice, onComplete, onNavigate, onExam }: { course: Course; lesson: Lesson; index: number; total: number; done: boolean; answer?: number; practiceChecked: boolean; onBack: () => void; onAnswer: (answer: number) => void; onPractice: (checked: boolean) => void; onComplete: () => void; onNavigate: (id: string) => void; onExam: () => void }) {
    const order = useMemo(() => choiceOrder(lesson.id, lesson.options.length), [lesson.id, lesson.options.length])
    const correct = answer === lesson.answer
    const previous = course.lessons[index - 1]
    const next = course.lessons[index + 1]
    async function copyCode() {
        try { await navigator.clipboard.writeText(lesson.example) } catch { /* clipboard may be unavailable */ }
    }
    return <article className="lesson-page">
        <button className="back-link" onClick={onBack}>← {course.name}</button>
        <div className="lesson-progress-head"><span>{lesson.module} <b>·</b> Урок {index + 1} из {total}</span><span>{Math.round((index + (done ? 1 : 0)) * 100 / total)}%</span></div><div className="progress-track"><span style={{ width: ((index + (done ? 1 : 0)) * 100 / total) + '%' }} /></div>
        <header className="lesson-title-block"><span className="eyebrow">{course.name.toUpperCase()} · ПРАКТИЧЕСКИЙ УРОК</span><h1>{lesson.title}</h1><p>{lesson.goal}</p></header>
        <section className="lesson-concept panel"><div className="content-kicker"><span className="content-icon icon-violet">01</span><div><span className="eyebrow">РАЗБЕРЁМСЯ</span><h2>Главная идея</h2></div></div><p>{lesson.explanation}</p></section>
        {lesson.deepDive && <section className="lesson-deep-dive panel"><div className="content-kicker"><span className="content-icon icon-violet">i</span><div><span className="eyebrow">ЧУТЬ ГЛУБЖЕ</span><h2>Что это значит на практике</h2></div></div><div className="deep-dive-copy">{lesson.deepDive.split('\n\n').map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</div>{lesson.terms && <div className="term-list"><b>Термины урока</b>{lesson.terms.map(term => <span key={term}>{term}</span>)}</div>}</section>}
        <section className="example-panel"><div className="example-head"><div><span className="eyebrow">ПРИМЕР</span><h2>Код в контексте</h2></div><button className="copy-button" onClick={copyCode}>▣ Скопировать</button></div><pre className="code-sample"><code>{lesson.example}</code></pre>{lesson.expectedOutput && <div className="expected-output"><b>Что должно получиться</b><pre><code>{lesson.expectedOutput}</code></pre></div>}<div className="walkthrough"><h3>Разбор каждой части</h3><ol>{lesson.walkthrough.map((line, step) => <li key={step}><span>{String(step + 1).padStart(2, '0')}</span><p>{line}</p></li>)}</ol></div></section>
        <section className="mistake-section panel"><div className="mistake-heading"><span className="mistake-icon">!</span><div><span className="eyebrow">ТИПИЧНАЯ ОШИБКА</span><h2>Как выглядит сбой и как его исправить</h2><p>{lesson.mistake}</p></div></div>{lesson.mistakeExamples?.length ? <div className="mistake-examples">{lesson.mistakeExamples.map((example, exampleIndex) => <article className="mistake-example" key={example.title}><h3><span>{String(exampleIndex + 1).padStart(2, '0')}</span>{example.title}</h3><div className="mistake-code-grid"><div><b className="bad-code-label">Ошибка</b><pre className="code-sample bad-code"><code>{example.wrong}</code></pre></div><div><b className="good-code-label">Исправление</b><pre className="code-sample good-code"><code>{example.correct}</code></pre></div></div><p>{example.explanation}</p></article>)}</div> : <p className="mistake-fallback">Сверь сообщение ошибки с примером выше: найди строку, где нарушено правило, и проверь, что именно ожидает язык или браузер.</p>}</section>
        <section className="practice-panel panel"><div className="content-kicker"><span className="content-icon icon-mint">02</span><div><span className="eyebrow">СДЕЛАЙ САМ</span><h2>Практика</h2></div></div><p>{lesson.exercise}</p><div className="acceptance-box"><b>Проверь перед зачётом</b><p>{lesson.acceptance}</p></div><label className="practice-confirm"><input type="checkbox" checked={practiceChecked} onChange={event => onPractice(event.target.checked)} /><span>Я выполнил задание и проверил результат по критерию выше</span></label></section>
        <section className="quiz-panel panel"><div className="content-kicker"><span className="content-icon icon-amber">03</span><div><span className="eyebrow">МИНИ-ПРОВЕРКА</span><h2>Проверь понимание</h2></div></div><p className="quiz-question">{lesson.question}</p><div className="quiz-options">{order.map((optionIndex, displayIndex) => <button key={optionIndex} className={['quiz-option', answer !== undefined && optionIndex === lesson.answer ? 'option-correct' : '', answer === optionIndex && optionIndex !== lesson.answer ? 'option-wrong' : ''].join(' ')} onClick={() => onAnswer(optionIndex)} aria-pressed={answer === optionIndex}><span>{String.fromCharCode(65 + displayIndex)}</span>{lesson.options[optionIndex]}</button>)}</div>{answer !== undefined && <div className={['quiz-feedback', correct ? 'feedback-correct' : 'feedback-wrong'].join(' ')} role="status"><b>{correct ? 'Верно' : 'Пока нет'}</b><span>{lesson.rationale}</span></div>}</section>
        <div className="lesson-completion"><div><b>{done ? 'Урок зачтён' : 'Зачёт урока'}</b><p>{done ? 'Ты можешь вернуться к этой теме в любой момент.' : 'Ответь на мини-проверку правильно и отметь практику выполненной.'}</p></div><button className="button-primary" disabled={!done && (!correct || !practiceChecked)} onClick={onComplete}>{done ? 'Готово ✓' : 'Отметить урок пройденным'}</button></div>
        <div className="lesson-nav">{previous ? <button onClick={() => onNavigate(previous.id)}>← <span><small>ПРЕДЫДУЩИЙ</small><b>{previous.title}</b></span></button> : <button onClick={onBack}>← <span><small>КУРС</small><b>Учебный план</b></span></button>}{next ? <button className="next-lesson" onClick={() => onNavigate(next.id)}><span><small>СЛЕДУЮЩИЙ</small><b>{next.title}</b></span> →</button> : <button className="next-lesson" onClick={onExam}><span><small>ФИНАЛЬНАЯ ПРОВЕРКА</small><b>Экзамен по курсу</b></span> ◷</button>}</div>
    </article>
}
function ProjectsPage({ data, onUpdate, onCourse }: { data: AppData; onUpdate: (id: CourseId, patch: Partial<ProjectState>) => void; onCourse: (id: CourseId) => void }) {
    return <div><PageHeading eyebrow="ПОРТФОЛИО" title="Проекты" description="Здесь ты ведёшь итоговые работы курсов: от постановки задачи до репозитория и опубликованного демо." /><section className="project-guide panel"><div className="project-guide-heading"><span className="content-icon icon-violet">↗</span><div><span className="eyebrow">КАК ЭТО РАБОТАЕТ</span><h2>Проектная страница — твой личный трекер</h2></div></div><p>Каждая карточка описывает самостоятельную работу по курсу. Это не встроенный редактор и не автоматическая проверка кода: ты пишешь проект в VS Code, а здесь отмечаешь готовые этапы и сохраняешь ссылки на результат.</p><ol><li><b>Выбери проект</b><span>Прочитай задачу и открой соответствующий курс, чтобы повторить нужные темы.</span></li><li><b>Создай папку и репозиторий</b><span>Начни проект локально, добавь README с целью, запуском и скриншотом.</span></li><li><b>Отмечай только проверенное</b><span>Запусти приложение, проверь мобильный экран, ошибки и критерии пункта.</span></li><li><b>Добавь ссылки</b><span>Вставь адрес GitHub-репозитория и работающего демо, чтобы вернуться к ним из профиля.</span></li></ol><div className="project-guide-note"><b>Что означает процент готовности?</b><span>Доля отмеченных пунктов чек-листа. Приложение хранит прогресс на этом устройстве, но не открывает и не оценивает твой код автоматически.</span></div></section><div className="project-grid">{courses.map(course => {
        const state = data.projectStates[course.id] ?? { checked: [], repository: '', demo: '' }
        const validChecked = state.checked.filter(item => course.project.deliverables.includes(item))
        const percent = Math.round(validChecked.length * 100 / course.project.deliverables.length)
        return <article className="project-card panel" key={course.id}><div className="project-card-head"><CourseMark course={course} /><span className="project-progress">{percent}% готово · {validChecked.length}/{course.project.deliverables.length}</span></div><span className="eyebrow">{course.name} · ИТОГОВЫЙ ПРОЕКТ</span><h2>{course.project.title}</h2><p>{course.project.brief}</p><div className="project-step-hint"><b>Сначала</b><span>Пройди курс и собери рабочую версию в отдельной папке. Отмечай пункт только после личной проверки.</span></div><div className="project-checklist">{course.project.deliverables.map(item => <label key={item}><input type="checkbox" checked={validChecked.includes(item)} onChange={event => onUpdate(course.id, { checked: event.target.checked ? [...validChecked, item] : validChecked.filter(value => value !== item) })} /><span>{item}</span></label>)}</div><label className="project-field">Ссылка на репозиторий<input value={state.repository} onChange={event => onUpdate(course.id, { repository: event.target.value })} placeholder="https://github.com/..." /></label><label className="project-field">Ссылка на демо<input value={state.demo} onChange={event => onUpdate(course.id, { demo: event.target.value })} placeholder="https://..." /></label><button className="text-action" onClick={() => onCourse(course.id)}>Учебный план курса <span>→</span></button></article>
    })}</div></div>
}
function ExamsPage({ data, results, activeAttempt, onStart, onCourse, onResume }: { data: AppData; results: ExamResults; activeAttempt: ExamAttempt | null; onStart: (id: CourseId) => void; onCourse: (id: CourseId) => void; onResume: () => void }) {
    const passed = courses.filter(course => results[course.id]?.passed).length
    return <div><PageHeading eyebrow="ИТОГОВАЯ ПРОВЕРКА" title="Экзамены" description="Для каждого курса — экзамен с таймером, перемешанными вопросами и персональным планом повторения." /><div className="exam-intro"><div className="exam-intro-icon">◷</div><div><b>Порог успешной сдачи — 80 из 100</b><p>Ответы сохраняются во время попытки. По завершении увидишь результат, ошибочные темы и следующие уроки для повторения.</p></div><div className="exam-score-badge"><strong>{passed}/{courses.length}</strong><span>сдано</span></div></div>{activeAttempt && <div className="resume-exam"><div><span className="eyebrow">ЕСТЬ АКТИВНАЯ ПОПЫТКА</span><b>{courseById(activeAttempt.courseId).name} · таймер продолжает идти</b></div><button className="button-primary" onClick={onResume}>Вернуться к экзамену →</button></div>}<div className="exam-course-grid">{courses.map(course => {
        const result = results[course.id]
        const done = completedFor(data, course).length
        return <article className="exam-course-card panel" key={course.id}><div className="card-top"><CourseMark course={course} /><span className={result?.passed ? 'exam-status passed' : result ? 'exam-status retry' : 'exam-status'}>{result?.passed ? 'Сдан' : result ? 'Повторить' : 'Не начат'}</span></div><h2>{course.name}</h2><p>{course.lessonCount} тем · {examQuestionCountFor(course)} вопросов · {course.examMinutes} минут</p>{result && <div className="last-score"><strong>{result.score}</strong><span>/ 100 · {result.correct} из {result.total} правильных</span></div>}<div className="progress-track"><span style={{ width: Math.round(done * 100 / course.lessonCount) + '%' }} /></div><small>Курс пройден на {Math.round(done * 100 / course.lessonCount)}%</small><div className="exam-actions"><button className="button-primary" onClick={() => onStart(course.id)}>{result ? 'Пересдать экзамен' : 'Начать экзамен'} →</button><button className="icon-button" onClick={() => onCourse(course.id)} title="Открыть курс" aria-label={'Открыть курс ' + course.name}>↗</button></div></article>
    })}</div></div>
}
function ExamPage({ course, attempt, item, lesson, index, remaining, onIndex, onAnswer, onFinish, onQuit }: { course: Course; attempt: ExamAttempt; item: ExamItem; lesson: Lesson; index: number; remaining: number; onIndex: (index: number) => void; onAnswer: (id: string, answer: number) => void; onFinish: () => void; onQuit: () => void }) {
    const selected = attempt.answers[lesson.id]
    const unanswered = attempt.items.filter(question => attempt.answers[question.lessonId] === undefined).length
    return <div className="exam-page"><header className="exam-top"><button className="back-link" onClick={onQuit}>← К экзаменам (сохранить попытку)</button><div className="exam-course-label"><CourseMark course={course} /><span><b>{course.name}</b><small>Итоговый экзамен</small></span></div><div className={['exam-timer', remaining < 120_000 ? 'timer-warning' : ''].join(' ')}><span>ОСТАЛОСЬ</span><strong>◷ {formatTime(remaining)}</strong></div></header><div className="exam-body"><div className="exam-question-column"><div className="exam-question-meta"><span>ВОПРОС {index + 1} ИЗ {attempt.items.length}</span><span>{Object.keys(attempt.answers).length}/{attempt.items.length} отвечено</span></div><div className="exam-progress-dots">{attempt.items.map((question, number) => <button key={question.lessonId} className={['exam-dot', number === index ? 'dot-current' : '', attempt.answers[question.lessonId] !== undefined ? 'dot-answered' : ''].join(' ')} onClick={() => onIndex(number)} aria-label={'Перейти к вопросу ' + (number + 1)}>{number + 1}</button>)}</div><section className="exam-question panel"><span className="eyebrow">{lesson.module}</span><h1>{lesson.question}</h1><div className="exam-options">{item.order.map((optionIndex, displayIndex) => <button key={optionIndex} className={['exam-option', selected === optionIndex ? 'exam-option-selected' : ''].join(' ')} onClick={() => onAnswer(lesson.id, optionIndex)}><span>{String.fromCharCode(65 + displayIndex)}</span>{lesson.options[optionIndex]}</button>)}</div></section><div className="exam-navigation"><button className="button-secondary" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0}>← Назад</button>{index < attempt.items.length - 1 ? <button className="button-primary" onClick={() => onIndex(index + 1)}>Следующий вопрос →</button> : <button className="button-primary" onClick={onFinish}>Завершить экзамен →</button>}</div></div><aside className="exam-sidebar panel"><span className="eyebrow">ВАЖНО</span><h3>Работай спокойно</h3><ul><li>Таймер продолжает идти, если закрыть страницу.</li><li>Ответы сохраняются автоматически на этом устройстве.</li><li>После окончания времени попытка отправится сама.</li></ul><div className="aside-divider" /><div className="unanswered-note">{unanswered ? 'Без ответа: ' + unanswered : 'На все вопросы дан ответ'}</div><button className="button-secondary full-button" onClick={onFinish}>Сдать сейчас</button></aside></div></div>
}
function ExamResultPage({ result, course, onCourse, onLesson, onRetry, onDiploma, canGetDiploma }: { result: ExamResult; course: Course; onCourse: () => void; onLesson: (id: string) => void; onRetry: () => void; onDiploma: () => void; canGetDiploma: boolean }) {
    const missed = result.responses.filter(response => !response.correct).map(response => course.lessons.find(lesson => lesson.id === response.lessonId)!).filter(Boolean)
    const level = result.score >= 90 ? 'Отличный результат' : result.score >= 80 ? 'Экзамен пройден' : result.score >= 60 ? 'Основа есть — повтори несколько тем' : 'Вернись к ключевым основам'
    const message = result.score >= 90 ? 'Ты уверенно ориентируешься в программе курса.' : result.score >= 80 ? 'Порог зачёта достигнут. Закрепи знания итоговым проектом.' : result.score >= 60 ? 'Посмотри темы ниже и пересдай после практики.' : 'Открой рекомендации, пройди упражнения и попробуй снова.'
    return <div className="result-page"><PageHeading eyebrow={course.name.toUpperCase()} title="Результат экзамена" description="Оценка показывает, что повторить дальше, а не просто отвечает «да» или «нет»." /><section className={['result-hero', result.passed ? 'result-passed' : 'result-failed'].join(' ')}><div className="score-gauge"><strong>{result.score}</strong><span>из 100</span></div><div><span className="eyebrow">{result.passed ? 'ЗАЧЁТ' : 'ПОКА НЕ ЗАЧТЁН'}</span><h2>{level}</h2><p>{message}</p><div className="score-breakdown"><b>{result.correct} правильных</b><span>из {result.total} вопросов</span><span>Порог: 80 баллов</span></div></div></section>
        <section className="review-section"><div className="section-heading"><div><span className="eyebrow">ПЕРСОНАЛЬНЫЙ РАЗБОР</span><h2>{missed.length ? 'Темы, которые стоит повторить' : 'Все ответы верны'}</h2></div></div>{missed.length ? <div className="review-list">{missed.map(lesson => <article className="review-row" key={lesson.id}><span className="review-mark">↻</span><div><b>{lesson.title}</b><small>{lesson.module}</small><p>{lesson.rationale}</p></div><button className="text-action" onClick={() => onLesson(lesson.id)}>Повторить урок →</button></article>)}</div> : <div className="success-note">Отличная работа: ошибок в этой попытке нет. Теперь проверь итоговый проект.</div>}</section>
        <section className="score-scale"><span className="eyebrow">ШКАЛА ОЦЕНКИ</span><div><b className="scale-red">0–59</b><span>Повтори основные понятия</span></div><div><b className="scale-amber">60–79</b><span>Закрепи слабые темы и пересдай</span></div><div><b className="scale-green">80–89</b><span>Экзамен сдан</span></div><div><b className="scale-violet">90–100</b><span>Сильное владение материалом</span></div></section>
        <div className="result-actions"><button className="button-secondary" onClick={onCourse}>Учебный план</button><button className="button-secondary" onClick={onRetry}>Пройти ещё раз</button>{canGetDiploma && <button className="button-primary" onClick={onDiploma}>Получить диплом</button>}</div>
    </div>
}
function ProfilePage({ data, results, stats, certificates, onName, onPhoto, onDiploma, onCourse }: { data: AppData; results: ExamResults; stats: LearningStats; certificates: Course[]; onName: (name: string) => void; onPhoto: (file?: File) => void; onDiploma: (id: CourseId) => void; onCourse: (id: CourseId) => void }) {
    const done = stats.lessons
    const unlockedAchievements = stats.achievements.filter(item => item.progress >= item.target).length
    return <div><PageHeading eyebrow="ЛИЧНЫЙ КАБИНЕТ" title="Профиль" description="Учебный прогресс, уровни, достижения, результаты и дипломы." /><div className="profile-layout"><section className="profile-card panel"><label className="avatar-upload"><Avatar name={data.nickname} src={data.avatar} /><span className="avatar-camera">↗</span><input type="file" accept="image/*" onChange={event => onPhoto(event.target.files?.[0])} aria-label="Выбрать фото профиля" /></label><div className="profile-name"><label htmlFor="profile-name">Никнейм</label><input id="profile-name" value={data.nickname} maxLength={32} onChange={event => onName(event.target.value)} /></div><label className="button-secondary photo-button">Выбрать фото или сделать снимок<input type="file" accept="image/*" capture="user" onChange={event => onPhoto(event.target.files?.[0])} /></label><small>Фото хранится в этом браузере; кадрирование настраивается в круглом предпросмотре.</small><div className="profile-stats"><div><b>{done}</b><span>уроков</span></div><div><b>{stats.passed}</b><span>экзаменов</span></div><div><b>{certificates.length}</b><span>дипломов</span></div></div><div className="profile-level-card"><span>ТЕКУЩИЙ УРОВЕНЬ</span><strong>{stats.level}<small>/ 20</small></strong><b>{stats.xp.toLocaleString('ru-RU')} XP</b><div className="progress-track"><span style={{ width: stats.levelProgress + '%' }} /></div><small>{stats.level === 20 ? 'Максимальный уровень открыт' : 'До следующего уровня: ' + (stats.nextLevelXp - stats.xp).toLocaleString('ru-RU') + ' XP'}</small></div></section><section className="profile-main"><div className="panel profile-progress-panel"><span className="eyebrow">ПРОГРЕСС ПО КУРСАМ</span>{courses.map(course => { const count = Math.min(course.lessonCount, completedFor(data, course).length); const result = results[course.id]; return <div className="profile-course-row" key={course.id}><CourseMark course={course} /><div><b>{course.name}</b><div className="progress-track"><span style={{ width: Math.round(count * 100 / course.lessonCount) + '%' }} /></div></div><span>{count}/{course.lessonCount}</span><span className={result?.passed ? 'profile-exam-pass' : ''}>{result?.passed ? result.score + ' баллов' : 'Экзамен не сдан'}</span></div> })}</div><section className="panel achievements-panel"><div className="section-heading compact"><div><span className="eyebrow">НАГРАДЫ ЗА УЧЁБУ</span><h2>Достижения <small>{unlockedAchievements}/{stats.achievements.length}</small></h2></div></div><p className="achievement-intro">Получай отметки за завершённые уроки, сданные экзамены и проверенные пункты проектов. XP повышает уровень от 1 до 20.</p><div className="achievement-grid">{stats.achievements.map(achievement => { const earned = achievement.progress >= achievement.target; const progress = Math.min(achievement.progress, achievement.target); return <article key={achievement.id} className={['achievement-card', earned ? 'achievement-earned' : ''].join(' ')}><div className="achievement-card-top"><span className="achievement-icon">{achievement.icon}</span><span className="achievement-category">{achievement.category}</span></div><h3>{achievement.title}</h3><p>{achievement.description}</p><div className="achievement-progress-label"><span>{earned ? 'Получено' : 'Прогресс'}</span><b>{progress}/{achievement.target}</b></div><div className="progress-track"><span style={{ width: Math.round(progress * 100 / achievement.target) + '%' }} /></div></article> })}</div></section><div className="panel certificates-panel"><div className="section-heading compact"><div><span className="eyebrow">ДОКУМЕНТЫ</span><h2>Дипломы курса</h2></div></div>{certificates.length ? certificates.map(course => <div className="certificate-row" key={course.id}><CourseMark course={course} /><div><b>{course.name}</b><small>Экзамен {results[course.id]?.score}/100 · освоено {course.skills.length} компетенций</small></div><button className="text-action" onClick={() => onDiploma(course.id)}>Открыть →</button></div>) : <div className="empty-state small-empty"><span>✧</span><b>Дипломов пока нет</b><p>Для диплома заверши все уроки курса и сдай экзамен минимум на 80 баллов.</p><button className="text-action" onClick={() => onCourse('html')}>Начать обучение →</button></div>}</div></section></div></div>
}
function SettingsPage({ data, permission, onTheme, onBackup, onProfile, onFeedback, onPrivacy, onReminder, onRequestPermission }: { data: AppData; permission: NotificationPermission | 'unsupported'; onTheme: () => void; onBackup: () => void; onProfile: () => void; onFeedback: (value: FeedbackState) => void; onPrivacy: (value: PrivacyState) => void; onReminder: (value: ReminderState) => void; onRequestPermission: () => void }) {
    const [tab, setTab] = useState<SettingsTab>('general')
    const [feedback, setFeedback] = useState<FeedbackState>(data.feedback)
    const [privacy, setPrivacy] = useState<PrivacyState>(data.privacy)
    const [saved, setSaved] = useState(false)
    function saveLocalFeedback() { onFeedback(feedback); setSaved(true); window.setTimeout(() => setSaved(false), 2500) }
    function downloadFeedback() {
        const content = ['Оценка: ' + feedback.rating + '/5', 'Нравится: ' + feedback.praise, 'Не нравится: ' + feedback.improve, 'Идеи: ' + feedback.ideas].join('\n\n')
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a'); link.href = url; link.download = 'codecraft-feedback.txt'; link.click(); URL.revokeObjectURL(url)
    }
    const tabLabels: { id: SettingsTab; label: string; icon: string }[] = [{ id: 'general', label: 'Основные', icon: '⚙' }, { id: 'feedback', label: 'Оценка', icon: '★' }, { id: 'privacy', label: 'Конфиденциальность', icon: '◉' }, { id: 'notifications', label: 'Уведомления', icon: '♧' }]
    return <div><PageHeading eyebrow="ПРЕДПОЧТЕНИЯ" title="Настройки" description="Каждый раздел — отдельно: внешний вид, отзыв, личные данные и напоминания." /><div className="settings-layout"><nav className="settings-tabs" aria-label="Разделы настроек">{tabLabels.map(item => <button key={item.id} className={tab === item.id ? 'settings-tab settings-tab-active' : 'settings-tab'} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav><div className="settings-content">
        {tab === 'general' && <div className="settings-list"><section className="settings-card panel"><div className="settings-symbol">☼</div><div><b>Внешний вид</b><p>Выбери удобную тему для занятий днём или вечером.</p></div><button className="button-secondary" onClick={onTheme}>Тема: {data.theme === 'light' ? 'Светлая' : 'Тёмная'}</button></section><section className="settings-card panel"><div className="settings-symbol">⇩</div><div><b>Резервная копия</b><p>Скачай файл с никнеймом, прогрессом, проектами и результатами экзаменов. Email и телефон в него не включаются.</p></div><button className="button-secondary" onClick={onBackup}>Скачать JSON</button></section><section className="settings-card panel"><div className="settings-symbol">◉</div><div><b>Профиль и аватар</b><p>Измени никнейм, выбери фотографию, посмотри достижения и дипломы.</p></div><button className="button-secondary" onClick={onProfile}>Открыть профиль</button></section><div className="privacy-note"><span>ⓘ</span><p>Данные обучения сохраняются локально в этом браузере. Для синхронизации между устройствами нужен серверный аккаунт.</p></div></div>}
        {tab === 'feedback' && <section className="panel settings-form-card"><span className="eyebrow">ТВОЁ МНЕНИЕ</span><h2>Оцени CODECRAFT Academy</h2><p>Оценка останется в этом браузере. Чтобы передать её разработчику, скачай файл отзыва и отправь его самостоятельно.</p><div className="rating-control" role="group" aria-label="Оценка от одного до пяти"><span>Общая оценка</span><div>{[1, 2, 3, 4, 5].map(star => <button key={star} type="button" className={star <= feedback.rating ? 'rating-star rating-star-active' : 'rating-star'} aria-label={star + ' из 5'} aria-pressed={feedback.rating === star} onClick={() => setFeedback(value => ({ ...value, rating: star }))}>★</button>)}</div></div><label className="settings-field">Что тебе нравится?<textarea value={feedback.praise} maxLength={800} onChange={event => setFeedback(value => ({ ...value, praise: event.target.value }))} placeholder="Например: структура уроков, навигация, дизайн…" /></label><label className="settings-field">Что стоит улучшить?<textarea value={feedback.improve} maxLength={800} onChange={event => setFeedback(value => ({ ...value, improve: event.target.value }))} placeholder="Опиши, что было неудобно или непонятно." /></label><label className="settings-field">Что добавить дальше?<textarea value={feedback.ideas} maxLength={800} onChange={event => setFeedback(value => ({ ...value, ideas: event.target.value }))} placeholder="Функции, темы уроков, новые проекты…" /></label><div className="settings-actions"><button className="button-primary" onClick={saveLocalFeedback}>{saved ? 'Сохранено в браузере ✓' : 'Сохранить оценку'}</button><button className="button-secondary" onClick={downloadFeedback}>Скачать отзыв</button></div><p className="form-privacy-note">Отзыв не отправляется автоматически: у приложения нет сервера обратной связи.</p></section>}
        {tab === 'privacy' && <section className="panel settings-form-card"><span className="eyebrow">ЛИЧНЫЕ ДАННЫЕ</span><h2>Контакты</h2><p>Поля нужны для твоих записей в этом профиле. Сейчас они не используются для входа, рассылок или восстановления доступа.</p><label className="settings-field">Электронная почта<input type="email" autoComplete="email" value={privacy.email} maxLength={120} onChange={event => setPrivacy(value => ({ ...value, email: event.target.value }))} placeholder="name@example.com" /></label><label className="settings-field">Номер телефона<input type="tel" autoComplete="tel" value={privacy.phone} maxLength={32} onChange={event => setPrivacy(value => ({ ...value, phone: event.target.value }))} placeholder="+7 900 000-00-00" /></label><button className="button-primary" onClick={() => { onPrivacy(privacy); setSaved(true); window.setTimeout(() => setSaved(false), 2500) }}>{saved ? 'Сохранено ✓' : 'Сохранить контакты'}</button><div className="privacy-warning"><b>Как хранятся контакты</b><span>Они сохраняются в localStorage без шифрования и остаются на этом устройстве. Не вноси сюда данные, которые не хочешь хранить в обычном профиле браузера.</span></div></section>}
        {tab === 'notifications' && <section className="panel settings-form-card"><span className="eyebrow">НАПОМИНАНИЯ</span><h2>Время для короткого урока</h2><p>Выбери ежедневное время. Напоминание сработает, пока CODECRAFT открыт в браузере и браузерные уведомления разрешены.</p><label className="settings-field">Время напоминания<input type="time" value={data.reminder.time} onChange={event => onReminder({ ...data.reminder, time: event.target.value })} /></label><div className="permission-status"><span className={permission === 'granted' ? 'permission-dot permission-ok' : 'permission-dot'} />{permission === 'granted' ? 'Разрешение браузера получено' : permission === 'denied' ? 'Уведомления запрещены в настройках браузера' : permission === 'unsupported' ? 'Этот браузер не поддерживает уведомления' : 'Браузер ещё не спрашивал разрешение'}</div>{permission !== 'granted' && permission !== 'denied' && permission !== 'unsupported' && <button className="button-secondary" onClick={onRequestPermission}>Разрешить уведомления</button>}{permission === 'denied' && <p className="form-privacy-note">Разрешение можно включить в настройках сайта в адресной строке браузера.</p>}{permission === 'granted' && <label className="reminder-toggle"><input type="checkbox" checked={data.reminder.enabled} onChange={event => onReminder({ ...data.reminder, enabled: event.target.checked })} /><span>Напоминать каждый день в выбранное время</span></label>}<div className="privacy-warning"><b>Ограничение браузера</b><span>Если вкладка закрыта или компьютер выключен, браузер без отдельного push-сервера не сможет показать напоминание.</span></div></section>}
    </div></div></div>
}
type AssistantMessage = { role: 'user' | 'assistant'; content: string }
type ApiMessage = AssistantMessage | { role: 'system'; content: string }
function AIPage({ nickname }: { nickname: string }) {
    const [endpoint, setEndpoint] = useState('https://api.openai.com/v1/chat/completions')
    const [model, setModel] = useState('')
    const [apiKey, setApiKey] = useState('')
    const [draft, setDraft] = useState('')
    const [messages, setMessages] = useState<AssistantMessage[]>([])
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    async function sendMessage(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const text = draft.trim()
        if (!text || busy) return
        if (!apiKey.trim() || !model.trim()) { setError('Внизу страницы укажи API-ключ и название модели.'); return }
        let parsed: URL
        try { parsed = new URL(endpoint) } catch { setError('Проверь адрес API: он должен быть полным URL.'); return }
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') { setError('Для удалённого сервиса используй HTTPS.'); return }
        const userMessage: AssistantMessage = { role: 'user', content: text }
        const nextMessages = [...messages, userMessage].slice(-24)
        setMessages(nextMessages); setDraft(''); setError(''); setBusy(true)
        try {
            const systemMessage: ApiMessage = { role: 'system', content: 'Ты — терпеливый преподаватель программирования CodeCraft. Отвечай по-русски, начинай с простой идеи, затем разбирай код по строкам. Для ошибки показывай неправильный и исправленный фрагменты. Не выдавай решение сразу, если полезнее сначала дать ученику подсказку. Уточняй язык и цель, если их нельзя понять из вопроса.' }
            const requestMessages: ApiMessage[] = [systemMessage, ...nextMessages]
            const response = await fetch(parsed.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey.trim() }, body: JSON.stringify({ model: model.trim(), store: false, messages: requestMessages }) })
            if (!response.ok) throw new Error('Сервис ответил кодом ' + response.status + '. Проверь ключ, модель и лимиты API.')
            const payload: unknown = await response.json()
            const content = typeof payload === 'object' && payload !== null && 'choices' in payload && Array.isArray(payload.choices) ? payload.choices[0]?.message?.content : undefined
            if (typeof content !== 'string' || !content.trim()) throw new Error('Ответ не распознан. Укажи endpoint совместимого Chat Completions API.')
            const assistantMessage: AssistantMessage = { role: 'assistant', content }
            setMessages([...nextMessages, assistantMessage].slice(-24))
        } catch (caught) {
            const message = caught instanceof TypeError ? 'Не удалось подключиться. Проверь интернет и CORS: API должен разрешать запросы с этого сайта.' : caught instanceof Error ? caught.message : 'Неизвестная ошибка подключения.'
            setError(message)
        } finally { setBusy(false) }
    }
    return <div className="ai-page"><PageHeading eyebrow="ПОМОЩНИК ПО ПРОГРАММИРОВАНИЮ" title="ИИ-наставник" description="Задавай вопросы по урокам, приноси ошибку или проси разобрать собственный код по шагам." /><div className="ai-notice"><span>ⓘ</span><p>Для ответа нужен API-ключ от выбранного провайдера. Чат обращается к нему напрямую из браузера; это экспериментальный режим для личного локального использования, а не безопасная схема для публикации сайта.</p></div><section className="ai-chat panel"><div className="ai-chat-heading"><span className="ai-avatar">✧</span><div><b>Наставник CodeCraft</b><small>{busy ? 'Разбирает вопрос…' : apiKey && model ? 'Подключение настроено' : 'Сначала добавь ключ и модель внизу'}</small></div><button className="button-secondary" disabled={busy || messages.length === 0} onClick={() => { setMessages([]); setError('') }}>Очистить чат</button></div><div className="ai-messages" aria-live="polite">{messages.length === 0 ? <div className="ai-empty"><span>✧</span><h2>С чего начнём?</h2><p>Спроси про конкретный урок, попроси найти ошибку в коде или объяснить незнакомый термин.</p><div className="ai-suggestions"><button onClick={() => setDraft('Объясни простыми словами, как работает переменная в Python.')}>Объясни тему урока</button><button onClick={() => setDraft('Помоги найти ошибку в моём коде. Я пришлю код и сообщение ошибки.')}>Разбери ошибку</button><button onClick={() => setDraft('Дай мне небольшую практическую задачу по JavaScript и проверь моё решение.')}>Дай задачу</button></div></div> : messages.map((message, index) => <article key={index} className={'ai-message ai-message-' + message.role}><b>{message.role === 'user' ? nickname : 'ИИ-наставник'}</b><pre>{message.content}</pre></article>)}</div><form className="ai-compose" onSubmit={sendMessage}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Напиши вопрос по программированию…" rows={3} maxLength={5000} disabled={busy} /><button className="button-primary" type="submit" disabled={busy || !draft.trim()}>{busy ? 'Думаю…' : 'Отправить →'}</button></form>{error && <p className="ai-error" role="alert">{error}</p>}</section><section className="panel ai-config"><span className="eyebrow">ПОДКЛЮЧЕНИЕ</span><h2>Настроить свой API</h2><p>Подойдёт endpoint, совместимый с форматом Chat Completions. Введённый ключ живёт только в памяти этой вкладки: он не записывается в профиль, резервную копию или localStorage и очищается после ухода с этой страницы.</p><label className="settings-field">Адрес API<input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://api.example.com/v1/chat/completions" /></label><label className="settings-field">Модель<input value={model} onChange={event => setModel(event.target.value)} placeholder="Введи имя модели из панели провайдера" /></label><label className="settings-field">API-ключ<input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Вставь личный ключ; он не сохраняется" /></label><button className="button-secondary" onClick={() => { setApiKey(''); setModel(''); setMessages([]); setError('') }}>Очистить ключ и историю</button><div className="privacy-warning"><b>Важно о ключе</b><span>Запрос и ключ уходят выбранному API-провайдеру. Ключ в браузере может быть доступен скриптам страницы и расширениям. Для публичного сайта нужен серверный proxy с секретом в переменной окружения; не вставляй реальный ключ в исходный код.</span></div></section></div>
}
function DiplomaModal({ course, nickname, result, onClose }: { course: Course; nickname: string; result?: ExamResult; onClose: () => void }) {
    return <div className="modal-backdrop diploma-backdrop"><article className="diploma-sheet"><div className="diploma-decoration">C</div><div className="diploma-brand"><span className="brand-mark">C</span> CODECRAFT ACADEMY</div><span className="eyebrow">ДИПЛОМ О ПРОХОЖДЕНИИ КУРСА</span><h1>Свидетельство о достижении</h1><p className="diploma-intro">Настоящий документ подтверждает, что</p><h2>{nickname || 'Разработчик'}</h2><p>завершил(а) программу обучения <strong>{course.name}</strong>, выполнил(а) практический проект и сдал(а) итоговый экзамен.</p><div className="diploma-skills"><b>Подтверждённые темы и навыки</b><ul>{course.skills.map(skill => <li key={skill}>✓ {skill}</li>)}</ul></div><div className="diploma-footer"><span>Результат экзамена: <b>{result?.score ?? 0}/100</b></span><span>Выдано: <b>{result ? new Date(result.finishedAt).toLocaleDateString('ru-RU') : '—'}</b></span></div><small className="diploma-note">Локальный документ CODECRAFT Academy. Не является государственной аккредитацией или независимой оценкой квалификации.</small><div className="diploma-actions no-print"><button className="button-secondary" onClick={onClose}>Закрыть</button><button className="button-primary" onClick={() => window.print()}>Печать / сохранить PDF</button></div></article></div>
}
