import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useMaintenance() {
  const [isUnderMaintenance, setIsUnderMaintenance] = useState(false);
  const [message, setMessage] = useState('This site is under maintenance.');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'maintenance'),
      (docSnap) => {
        if (docSnap.exists()) {
          setIsUnderMaintenance(docSnap.data().enabled || false);
          setMessage(docSnap.data().message || 'This site is under maintenance.');
        }
        setLoading(false);
      },
      (error) => {
        console.warn('Maintenance check failed:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { isUnderMaintenance, message, loading };
}
