import { executeCpp } from '../src/executor/cppExecutor.js';

// Helper to log test outcomes clearly
function logSection(title) {
  console.log('\n======================================');
  console.log(`TESTING: ${title}`);
  console.log('======================================');
}

async function runTests() {
  // Test Case 1: Valid C++ Code (Adding two numbers)
  logSection('Valid C++ Program (Sum of Two Numbers)');
  const validCode = `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << (a + b) << endl;
    }
    return 0;
}
  `;
  const validTestCases = [
    { input: '5 7\n', expectedOutput: '12' },   // Should PASS
    { input: '-3 10\n', expectedOutput: '7' },  // Should PASS
    { input: '2 2\n', expectedOutput: '5' }      // Should FAIL (expected is 5, output is 4)
  ];
  const validRes = await executeCpp(validCode, validTestCases);
  console.log('Result Summary:', JSON.stringify(validRes, null, 2));


  // Test Case 2: Compilation Error
  logSection('C++ Compile Error (Missing Semicolon)');
  const badCode = `
#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" // Missing semicolon
    return 0;
}
  `;
  const badRes = await executeCpp(badCode, [{ input: '', expectedOutput: '' }]);
  console.log('Result Summary:', JSON.stringify(badRes, null, 2));


  // Test Case 3: Runtime Error (Division by zero / Crash)
  logSection('C++ Runtime Error (Division by Zero)');
  const crashCode = `
#include <iostream>
using namespace std;
int main() {
    int x = 10;
    int y = 0;
    // Division by zero in C++ causes undefined behavior or runtime crash (SIGFPE)
    cout << (x / y) << endl;
    return 0;
}
  `;
  const crashRes = await executeCpp(crashCode, [{ input: '', expectedOutput: '0' }]);
  console.log('Result Summary:', JSON.stringify(crashRes, null, 2));


  // Test Case 4: Time Limit Exceeded (Infinite Loop)
  logSection('C++ Timeout (Infinite Loop)');
  const infiniteLoopCode = `
#include <iostream>
using namespace std;
int main() {
    int x = 0;
    while (true) {
        x++; // Infinite loop
    }
    return 0;
}
  `;
  // Test with a tight timeout of 1000ms
  const loopRes = await executeCpp(infiniteLoopCode, [{ input: '', expectedOutput: '' }], 1000);
  console.log('Result Summary:', JSON.stringify(loopRes, null, 2));

  // Test Case 5: Python (Valid script)
  logSection('Valid Python Program (Sum of Two Numbers)');
  const pyCode = `
import sys
for line in sys.stdin:
    parts = line.split()
    if len(parts) >= 2:
        print(int(parts[0]) + int(parts[1]))
  `;
  const pyTestCases = [
    { input: '5 7\n', expectedOutput: '12' },
    { input: '-3 10\n', expectedOutput: '7' }
  ];
  const pyRes = await executeCpp(pyCode, pyTestCases, 'python');
  console.log('Result Summary (Python):', JSON.stringify(pyRes, null, 2));

  // Test Case 6: Java (Valid script)
  logSection('Valid Java Program (Sum of Two Numbers)');
  const javaCode = `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            int b = sc.nextInt();
            System.out.println(a + b);
        }
    }
}
  `;
  const javaTestCases = [
    { input: '5 7\n', expectedOutput: '12' },
    { input: '-3 10\n', expectedOutput: '7' }
  ];
  const javaRes = await executeCpp(javaCode, javaTestCases, 'java');
  console.log('Result Summary (Java):', JSON.stringify(javaRes, null, 2));
}

runTests().catch(console.error);
