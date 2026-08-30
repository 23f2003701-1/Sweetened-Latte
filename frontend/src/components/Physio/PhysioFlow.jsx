import { useState } from 'react';
import PhysioUpload from './PhysioUpload';
import PrescriptionReview from './PrescriptionReview';
import PhysioObserver from './PhysioObserver';
import PhysioSummary from './PhysioSummary';

export default function PhysioFlow({ onSwitchMode }) {
  const [step, setStep] = useState('upload'); // 'upload' | 'review' | 'observer' | 'summary'
  const [prescription, setPrescription] = useState(null);
  const [activeExercise, setActiveExercise] = useState(null);
  const [sessionTelemetry, setSessionTelemetry] = useState(null);

  const handlePrescriptionParsed = (data) => {
    setPrescription(data);
    setStep('review');
  };

  const handleStartObserver = (exercise) => {
    setActiveExercise(exercise);
    setStep('observer');
  };

  const handleEndSession = (telemetry) => {
    setSessionTelemetry(telemetry);
    setStep('summary');
  };

  const handleRestart = () => {
    setStep('upload');
    setPrescription(null);
    setActiveExercise(null);
    setSessionTelemetry(null);
  };

  return (
    <>
      {step === 'upload' && (
        <PhysioUpload
          onPrescriptionParsed={handlePrescriptionParsed}
          onSwitchMode={onSwitchMode}
        />
      )}

      {step === 'review' && (
        <PrescriptionReview
          prescription={prescription}
          onStartObserver={handleStartObserver}
          onBack={() => setStep('upload')}
        />
      )}

      {step === 'observer' && (
        <PhysioObserver
          exercise={activeExercise}
          onEndSession={handleEndSession}
        />
      )}

      {step === 'summary' && (
        <PhysioSummary
          telemetry={sessionTelemetry}
          onRestart={handleRestart}
          onSwitchMode={onSwitchMode}
        />
      )}
    </>
  );
}
