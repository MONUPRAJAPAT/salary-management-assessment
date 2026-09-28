import type { NameLocale } from './reference-data';

/**
 * Per-locale name pools, so an employee in Osaka is not called "Bob Smith".
 *
 * This is demo data, and the point of making it plausible is that a reviewer can look
 * at the directory and believe it. The pools are small relative to headcount, so names
 * repeat — which is also true of a real 10,000-person company, and is why the seed
 * deduplicates email addresses rather than assuming names are unique.
 */
export interface NamePool {
  readonly first: readonly string[];
  readonly last: readonly string[];
}

export const NAME_POOLS: Record<NameLocale, NamePool> = {
  north_america: {
    first: ['James', 'Mary', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'William', 'Barbara', 'Marcus', 'Aisha', 'Tyler', 'Danielle', 'Jose', 'Sofia', 'Kevin', 'Rachel', 'Brandon', 'Nicole'],
    last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson'],
  },
  uk: {
    first: ['Oliver', 'Amelia', 'Harry', 'Olivia', 'George', 'Isla', 'Jack', 'Ava', 'Charlie', 'Emily', 'Thomas', 'Sophie', 'Arthur', 'Grace', 'Freddie', 'Poppy', 'Alfie', 'Chloe'],
    last: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards'],
  },
  germany: {
    first: ['Lukas', 'Hannah', 'Leon', 'Mia', 'Finn', 'Emma', 'Jonas', 'Sofia', 'Paul', 'Lena', 'Felix', 'Marie', 'Maximilian', 'Laura', 'Elias', 'Johanna', 'Noah', 'Clara'],
    last: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Zimmermann'],
  },
  poland: {
    first: ['Jakub', 'Zofia', 'Antoni', 'Julia', 'Jan', 'Maja', 'Szymon', 'Hanna', 'Franciszek', 'Lena', 'Michał', 'Alicja', 'Wojciech', 'Oliwia', 'Piotr', 'Amelia', 'Marcin', 'Natalia'],
    last: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Krawczyk', 'Piotrowski'],
  },
  india: {
    first: ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vivaan', 'Diya', 'Aditya', 'Ishita', 'Arjun', 'Kavya', 'Rahul', 'Meera', 'Karthik', 'Sneha', 'Siddharth', 'Nandini', 'Vikram', 'Pooja', 'Ravi', 'Lakshmi', 'Anil', 'Divya'],
    last: ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Gupta', 'Singh', 'Rao', 'Desai', 'Chatterjee', 'Menon', 'Joshi', 'Kulkarni', 'Banerjee', 'Pillai', 'Agarwal', 'Bose'],
  },
  singapore: {
    first: ['Wei Ming', 'Siti', 'Jun Jie', 'Mei Ling', 'Hao Ran', 'Nurul', 'Zhi Hao', 'Xin Yi', 'Aravind', 'Farah', 'Kai Wen', 'Shu Fen', 'Daniel', 'Priyanka', 'Ryan', 'Jia Hui'],
    last: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Chan', 'Goh', 'Koh', 'Teo', 'Ong', 'bin Ismail', 'binti Rahman', 'Kumar', 'Raj', 'Chua', 'Yeo'],
  },
  australia: {
    first: ['Jack', 'Charlotte', 'Oliver', 'Olivia', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'Henry', 'Ruby', 'Lachlan', 'Zoe', 'Ethan', 'Matilda'],
    last: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Nguyen', 'Martin', 'White', 'Anderson', 'Thompson', 'Walker', 'Harris', 'Ryan', 'Campbell', 'Kelly'],
  },
  japan: {
    first: ['Haruto', 'Yui', 'Sota', 'Aoi', 'Yuto', 'Hina', 'Riku', 'Sakura', 'Ren', 'Rin', 'Kaito', 'Mei', 'Daiki', 'Yuna', 'Sho', 'Akari'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto', 'Inoue', 'Kimura'],
  },
  brazil: {
    first: ['Miguel', 'Alice', 'Arthur', 'Sophia', 'Gael', 'Helena', 'Théo', 'Valentina', 'Heitor', 'Laura', 'Davi', 'Isabella', 'Bernardo', 'Manuela', 'Lucas', 'Júlia'],
    last: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes'],
  },
};

/** Strips diacritics and punctuation so "Zofia Wiśniewski" gets a usable email address. */
export function toEmailToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}
