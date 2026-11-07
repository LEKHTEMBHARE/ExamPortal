export const mcqQuestions = [
  {
    question: 'Which Python statement is used to create a list of numbers from 1 to 5?',
    options: ['list(range(1, 6))', 'range(1, 6)', '[1..5]', 'list(1, 5)'],
  },
  {
    question: 'What is the result of 5 // 2 in Python?',
    options: ['2.5', '2', '3', '2.0'],
  },
  {
    question: 'Which library is most commonly used for data manipulation in Python?',
    options: ['matplotlib', 'pandas', 'numpy', 'requests'],
  },
  {
    question: 'Which method is used to read a CSV file using pandas?',
    options: ['read_csv()', 'load_csv()', 'open_csv()', 'csv_read()'],
  },
  {
    question: 'Which of the following is a valid dictionary literal?',
    options: ['{"name": "Alice", "age": 25}', '{["name": "Alice", "age": 25]}', 'dict("name" = "Alice")', '({name: "Alice"})'],
  },
  {
    question: 'How do you remove duplicate values from a list while preserving order?',
    options: ['set(list)', 'sorted(list)', 'list(dict.fromkeys(list))', 'unique(list)'],
  },
  {
    question: 'Which Python function is used to find the length of a list?',
    options: ['len()', 'size()', 'count()', 'length()'],
  },
  {
    question: 'What does a DataFrame represent in pandas?',
    options: ['A single row', 'A 2D tabular data structure', 'A list of strings', 'A dictionary'],
  },
  {
    question: 'Which expression returns True if x is greater than or equal to 10?',
    options: ['x > 10', 'x >= 10', 'x == 10', 'x < 10'],
  },
  {
    question: 'Which of the following is a valid way to concatenate strings?',
    options: ['"A" + "B"', '"A".join("B")', '"A" * "B"', 'concat("A", "B")'],
  },
  {
    question: 'What is the purpose of the pandas .groupby() method?',
    options: ['Sort a column alphabetically', 'Aggregate records by a key', 'Remove null values', 'Create a plot'],
  },
  {
    question: 'Which of these is best suited for numerical computations with large arrays?',
    options: ['pandas', 'numpy', 'json', 'os'],
  },
  {
    question: 'In Python, what is a list comprehension used for?',
    options: ['To create lists succinctly', 'To write CSS rules', 'To generate SQL queries', 'To connect to Firebase'],
  },
  {
    question: 'Which statement correctly opens a file for writing text?',
    options: ['open("file.txt", "w")', 'open("file.txt", "read")', 'read("file.txt")', 'write("file.txt")'],
  },
  {
    question: 'Which plotting library is commonly used with Python for visual analysis?',
    options: ['matplotlib', 'requests', 'flask', 'sqlite3'],
  },
  {
    question: 'Which method can be used to convert a DataFrame column to a list?',
    options: ['to_list()', 'list(df["col"])', 'df.tolist()', 'all of the above'],
  },
  {
    question: 'How do you access the first item of a list called values?',
    options: ['values[0]', 'values.first()', 'first(values)', 'values[1]'],
  },
  {
    question: 'What does the pandas .isnull() method detect?',
    options: ['Empty strings only', 'Missing or null values', 'Numbers greater than zero', 'DataFrame schema'],
  },
  {
    question: 'Which code block correctly handles an exception?',
    options: ['try: ... except: ...', 'if error: ...', 'catch: ...', 'finally: ... except: ...'],
  },
  {
    question: 'Which of the following is a valid set literal?',
    options: ['{1, 2, 3}', '[1, 2, 3]', '(1, 2, 3)', '{1: "a"}'],
  },
];

export const codingQuestions = [
  {
    id: 'coding-1',
    title: 'Coding Challenge 1: Filter and Summarize Age Data',
    requirement: 'Update the function so it returns the average age of all adults (age >= 18) in the supplied list. Keep the function name as calculate_average_adult_age and ensure the result is a float value, not an integer.',
    starterCode: `def calculate_average_adult_age(ages):
    adults = [age for age in ages if age >= 18]
    if not adults:
        return 0
    return sum(adults) / len(adults)
`,
  },
  {
    id: 'coding-2',
    title: 'Coding Challenge 2: Clean and Validate Numeric Data',
    requirement: 'Modify the function to remove invalid values, convert valid numeric strings to floats, and return only the cleaned values in the original order. The function should be named clean_numbers and should ignore non-numeric entries instead of failing.',
    starterCode: `def clean_numbers(values):
    cleaned = []
    for value in values:
        try:
            cleaned.append(float(value))
        except (TypeError, ValueError):
            continue
    return cleaned
`,
  },
];

export const oralQuestions = [
  'Explain the role of Python in data cleaning and preparation for analytics workflows.',
  'What is the difference between a list and a tuple in Python, and when would you choose each?',
  'Describe how you would handle missing values in a dataset before building a machine learning or analytics model.',
  'How does a DataFrame differ from a dictionary in Python, and why is pandas useful for tabular data?',
  'Explain the importance of data validation and how you would verify the quality of a dataset.',
];

export const examConfig = {
  phaseDurationSeconds: {
    phase1: 600,
    phase2: 600,
    phase3: 600,
  },
  examName: 'Python + Data Analytics',
};
