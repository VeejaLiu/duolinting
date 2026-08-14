import { Pressable, Text, TextInput, View } from 'react-native'
import { useEffect, useState } from 'react'
import { useLanguage } from '@/i18n/LanguageProvider'

export function AcceptedAnswerFeedbackSheet({
  initialAnswer,
  onSubmit,
  submitted,
  errorMessage,
}: {
  initialAnswer: string
  onSubmit: (submittedAnswer: string) => Promise<void>
  submitted: boolean
  errorMessage?: string
}) {
  const { t } = useLanguage()
  const [value, setValue] = useState(initialAnswer)
  const [submitting, setSubmitting] = useState(false)
  const normalizedValue = value.trim()
  const disabled = submitting || submitted || !normalizedValue

  useEffect(() => {
    setValue(initialAnswer)
  }, [initialAnswer])

  return (
    <View className="rounded-xl border border-border bg-surface px-4 py-4">
      <Text className="text-base font-semibold text-text-primary">
        {t('feedback.title')}
      </Text>
      <Text className="mt-2 text-sm text-text-secondary">
        {t('feedback.description')}
      </Text>
      <TextInput
        className="mt-3 rounded-xl border border-border px-4 py-3 text-text-primary"
        editable={!submitted && !submitting}
        multiline
        onChangeText={setValue}
        placeholder={t('feedback.placeholder')}
        value={value}
      />
      <Pressable
        className={`mt-3 rounded-pill px-5 py-3 ${
          submitted ? 'bg-success' : 'bg-brand'
        }`}
        disabled={disabled}
        onPress={async () => {
          if (!normalizedValue) {
            return
          }
          setSubmitting(true)
          try {
            await onSubmit(normalizedValue)
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <Text className="text-center font-semibold text-white">
          {submitted ? t('feedback.submitted') : submitting ? t('feedback.submitting') : t('feedback.submit')}
        </Text>
      </Pressable>
      {errorMessage ? (
        <Text className="mt-3 text-sm text-danger">{errorMessage}</Text>
      ) : null}
      {!submitted && !normalizedValue ? (
        <Text className="mt-3 text-sm text-text-secondary">
          {t('feedback.required')}
        </Text>
      ) : null}
      {submitted ? (
        <Text className="mt-3 text-sm text-success">
          {t('feedback.success')}
        </Text>
      ) : null}
    </View>
  )
}
