const fs = require('fs');
const file = 'project/app/(tabs)/index.tsx';
let content = fs.readFileSync(file, 'utf-8');

const startStr = '// Also check couple data';
const endStr = '} catch (error) {';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr, startIdx);

const oldText = content.substring(startIdx, endIdx);

const newText = `// Also check couple data to verify both users
      const coupleRef = doc(db, 'couples', coupleData.coupleCode);
      const coupleDoc = await getDoc(coupleRef);

      if (!mounted.current) return;

      // Track today's login for this user
      const userLogins = (coupleDoc.data()?.logins || {}) as { [key: string]: string };
      userLogins[coupleData.nickname] = today;

      // Actually save the login unconditionally so partner's login is recorded
      await setDoc(coupleRef, { logins: userLogins }, { merge: true });

      // Check if both users logged in today. Since a couple has exactly 2 members,
      // we check if we have 2 distinct nicknames logged in today.
      const allUsersLoggedInToday = Object.keys(userLogins).length === 2 &&
        Object.values(userLogins).every(loginDate => loginDate === today);

      if (streakDoc.exists()) {
        const data = streakDoc.data() as StreakData;
        const lastOpen = data.lastAppOpen;

        let newAppStreak = data.appStreak;
        let longestAppStreak = data.longestAppStreak || 0;
        let shouldIncreaseStreak = false;
        let needsDbUpdate = false;
        let newLastAppOpen = lastOpen;

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toDateString();

        if (lastOpen === today) {
          // Already successfully checked and updated today by both users
          if (mounted.current) {
            setStreakData(data);
          }
        } else {
          // Both users logged in today, time to advance or reset the streak
          if (allUsersLoggedInToday) {
            if (lastOpen === yesterdayStr) {
               newAppStreak += 1;
            } else {
               newAppStreak = 1; // It was broken
            }
            shouldIncreaseStreak = true;
            needsDbUpdate = true;
            newLastAppOpen = today;
          } 
          // Not both logged in today yet. What if it's completely broken from days past?
          else if (lastOpen !== yesterdayStr && lastOpen !== today) {
            if (newAppStreak !== 0) {
               newAppStreak = 0; // Streak is visibly broken
               needsDbUpdate = true;
               // DO NOT set newLastAppOpen to today. 
               // This way when the second person logs in later today, 
               // they will see allUsersLoggedInToday and start the streak at 1.
            }
          }

          if (needsDbUpdate) {
            longestAppStreak = Math.max(longestAppStreak, newAppStreak);
            
            await updateDoc(streakRef, {
              appStreak: newAppStreak,
              lastAppOpen: newLastAppOpen,
              longestAppStreak,
            });

            if (mounted.current) {
              setStreakData({ ...data, appStreak: newAppStreak, lastAppOpen: newLastAppOpen, longestAppStreak });
            }

            // Send streak notification if milestone
            if (shouldIncreaseStreak && newAppStreak > 0 && newAppStreak % 7 === 0) {
              try {
                const { notifyStreakMilestone } = await import('@/services/notifications');
                notifyStreakMilestone(coupleData.coupleCode, newAppStreak, 'app');
              } catch (e) { console.log(e); }
            }
          } else {
            if (mounted.current) {
              setStreakData({ ...data, appStreak: newAppStreak, lastAppOpen: newLastAppOpen });
            }
          }
        }
      } else {
        // Initial setup - only set streak to 1 if both users are here
        const initialStreak = allUsersLoggedInToday ? 1 : 0;
        const initialLastOpen = allUsersLoggedInToday ? today : '';
        const initialData = {
          appStreak: initialStreak,
          paragraphStreak: 0,
          lastAppOpen: initialLastOpen,
          lastParagraphDate: '',
          longestAppStreak: initialStreak,
          longestParagraphStreak: 0,
        };
        await setDoc(streakRef, initialData);
        if (mounted.current) {
          setStreakData(initialData);
        }
      }
    `;

fs.writeFileSync(file, content.replace(oldText, newText));
